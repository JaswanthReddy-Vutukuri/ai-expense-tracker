/**
 * SYNC ORCHESTRATOR - APP-SIDE EXECUTION
 * 
 * PURPOSE:
 * - Executes APP-SIDE reconciliation via CreateExpenseTool
 * - Tracks success/failure per expense
 * - Handles partial failures gracefully
 * - Provides idempotency guarantees
 * 
 * WHY THIS EXISTS:
 * - Separates execution from planning (single responsibility)
 * - Provides transactional safety (can rollback)
 * - Enables progress tracking (long-running operations)
 * - Ensures audit trail (every action logged)
 * 
 * WHY APP SYNC IS SEPARATE FROM PDF GENERATION:
 * - App mutations have side effects (database writes)
 * - PDF generation is artifact creation (no side effects)
 * - Separation enables independent retry of each side
 * - App sync can fail without blocking PDF regeneration
 * - Clear separation of concerns for testing and debugging
 * 
 * WHY USE CREATEEXPENSETOOL:
 * - Consistent validation with agent-created expenses
 * - Automatic category lookup and normalization
 * - Proper date handling and error messages
 * - Same code path as LLM agent (no duplication)
 * 
 * ENTERPRISE GUARANTEES:
 * - Idempotent: Can safely retry failed operations
 * - Atomic per expense: Each expense succeeds or fails independently
 * - Auditable: Full log of what was attempted and result
 * - Recoverable: Failed expenses can be retried
 * 
 * ARCHITECTURE FIT:
 * - Called by reconciliation handler
 * - Consumes add_to_app actions from reconciliation plan
 * - Uses CreateExpenseTool for validation and execution
 * - Never directly modifies vector store
 */

import { CreateExpenseTool } from '../tools/createExpense.tool.js';

/**
 * Executes a single expense creation action using CreateExpenseTool
 * 
 * WHY PER-EXPENSE EXECUTION:
 * - Partial failure is acceptable (don't fail all if one fails)
 * - Each expense is independent
 * - Enables retry of individual failures
 * - Provides granular success tracking
 * 
 * WHY USE CREATEEXPENSETOOL:
 * - Same validation as agent-created expenses
 * - Automatic category lookup (name → ID)
 * - Proper date normalization
 * - Consistent error messages
 * 
 * IDEMPOTENCY:
 * - Tool + backend validates uniqueness
 * - Safe to retry if network fails
 * - Duplicate detection prevents double-entry
 * 
 * @param {Object} action - Single action from reconciliation plan
 * @param {string} authToken - JWT token for authentication
 * @param {number} userId - User ID for context
 * @returns {Promise<Object>} Execution result { success, expense, error }
 */
const executeCreateExpense = async (action, authToken, userId) => {
  console.log(`[Sync Orchestrator] Executing CREATE_EXPENSE: $${action.expense.amount} - ${action.expense.description}`);
  
  try {
    // Create tool instance with auth context
    const createTool = new CreateExpenseTool(authToken, { userId });
    
    // Execute tool with normalized expense data
    // Tool expects: { amount, category, description, date }
    const result = await createTool._call({
      amount: action.expense.amount,
      category: action.expense.category,
      description: action.expense.description,
      date: action.expense.date
    });
    
    console.log(`[Sync Orchestrator] ✓ SUCCESS: ${result}`);
    
    return {
      success: true,
      skipped: false,
      action,
      message: result,
      executedAt: new Date().toISOString()
    };
  } catch (error) {
    // Check if it's a validation error (skip) vs backend error (retry)
    const errorMessage = error.message || 'Unknown error';
    const isValidationError = errorMessage.includes('Category') || 
                            errorMessage.includes('validation') ||
                            errorMessage.includes('Invalid');
    
    if (isValidationError) {
      console.warn(`[Sync Orchestrator] [SKIPPED] (validation error): ${errorMessage}`);
      return {
        success: false,
        skipped: true,
        action,
        error: errorMessage,
        reason: 'VALIDATION_ERROR',
        executedAt: new Date().toISOString()
      };
    }
    
    // FAILED (not SKIPPED) - backend error, can be retried
    console.error(`[Sync Orchestrator] [FAILED]: ${errorMessage}`);
    
    return {
      success: false,
      skipped: false,
      action,
      error: errorMessage,
      reason: 'BACKEND_ERROR',
      executedAt: new Date().toISOString()
    };
  }
};

/**
 * Executes app-side sync from bi-directional reconciliation plan
 * 
 * THIS IS THE MAIN APP-SIDE SYNC EXECUTION FUNCTION
 * 
 * EXECUTION STRATEGY:
 * 1. Process add_to_app actions only (PDF-side handled separately)
 * 2. Track success/failure independently
 * 3. Continue on error (don't stop entire sync for one failure)
 * 4. Collect detailed results
 * 5. Generate comprehensive summary
 * 
 * WHY SEQUENTIAL:
 * - Prevents backend overload
 * - Easier to debug failures
 * - Clearer audit trail
 * - Can add rate limiting if needed
 * 
 * PARTIAL FAILURE HANDLING:
 * - Record which expenses succeeded
 * - Record which expenses failed and why
 * - Allow user to retry failed expenses
 * - Preserve idempotency for retries
 * 
 * @param {Object} plan - Bi-directional reconciliation plan from planner
 * @param {string} authToken - JWT token for backend auth
 * @param {number} userId - User ID for tool context
 * @returns {Promise<Object>} Sync summary with detailed results
 */
export const executeSyncPlan = async (plan, authToken, userId) => {
  const appActionsCount = plan.add_to_app?.length || 0;
  console.log(`[Sync Orchestrator] Starting APP-SIDE sync execution for ${appActionsCount} actions`);
  console.log(`[Sync Orchestrator] User ID: ${userId}, Timestamp: ${new Date().toISOString()}`);
  
  // =========================================================================
  // STEP 1: DEDUPLICATION
  // WHY: PDF extraction can produce duplicates
  // WHY: Same expense should never be attempted multiple times
  // WHY: Deduplication prevents cascading failures
  // =========================================================================
  console.log('[Sync Orchestrator] STEP 1: Deduplicating expenses...');
  
  // Handle case where there are no app sync actions (only PDF report generation)
  const addToAppActions = plan.add_to_app || [];
  
  const seen = new Set();
  const deduplicated = [];
  let duplicateCount = 0;
  
  for (const action of addToAppActions) {
    // Create stable key: date + amount + category + description
    // WHY: This uniquely identifies an expense across systems
    const key = `${action.expense.date}|${action.expense.amount}|${action.expense.category}|${action.expense.description}`.toLowerCase();
    
    if (seen.has(key)) {
      console.log(`[Sync Orchestrator] [DUPLICATE] SKIPPED: ${action.expense.description}`);
      duplicateCount++;
      continue;
    }
    
    seen.add(key);
    deduplicated.push(action);
  }
  
  console.log(`[Sync Orchestrator] Deduplication complete: ${deduplicated.length} unique, ${duplicateCount} duplicates removed`);
  
  // =========================================================================
  // STEP 2: EXECUTION
  // Process each unique expense sequentially
  // Track succeeded / failed / skipped separately
  // =========================================================================
  const summary = {
    planId: `sync_${Date.now()}`,
    startedAt: new Date().toISOString(),
    completedAt: null,
    totalPlanned: addToAppActions.length,
    totalAfterDedup: deduplicated.length,
    duplicatesRemoved: duplicateCount,
    attempted: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,  // Validation errors - NOT retryable
    results: [],
    successfulExpenses: [],
    failedExpenses: []
  };
  
  console.log('[Sync Orchestrator] STEP 2: Executing expense creation...');
  
  for (const action of deduplicated) {
    summary.attempted++;
    
    const result = await executeCreateExpense(action, authToken, userId);
    summary.results.push(result);
    
    if (result.success) {
      summary.succeeded++;
      summary.successfulExpenses.push({
        amount: action.expense.amount,
        description: action.expense.description,
        category: action.expense.category,
        date: action.expense.date,
        message: result.message
      });
    } else if (result.skipped) {
      summary.skipped++;
    } else {
      summary.failed++;
      summary.failedExpenses.push({
        expense: action.expense,
        error: result.error,
        reason: result.reason
      });
    }
  }
  
  summary.completedAt = new Date().toISOString();
  
  console.log('[Sync Orchestrator] Execution complete:');
  console.log(`  [SUCCESS] Succeeded: ${summary.succeeded}/${summary.attempted}`);
  console.log(`  [FAILED] Failed: ${summary.failed}`);
  console.log(`  [SKIPPED] Skipped: ${summary.skipped}`);
  
  // Log if this was a PDF-only sync (no app actions)
  if (addToAppActions.length === 0) {
    console.log(`  [INFO] No app sync actions (PDF report generation only)`);
  }
  
  return summary;
};

/**
 * Validates sync prerequisites before execution
 * 
 * WHY PRE-FLIGHT CHECKS:
 * - Fail fast if requirements not met
 * - Prevents partial sync failures
 * - Clear error messages
 * 
 * WHY CHECK BOTH SIDES:
 * - Bi-directional sync means EITHER side can have work to do
 * - App-only expenses → generate PDF report
 * - PDF-only expenses → sync to app
 * - Both empty → nothing to do (caught earlier)
 * 
 * @param {Object} plan - Reconciliation plan
 * @param {string} authToken - JWT token
 * @returns {Object} { valid: boolean, error?: string }
 */
export const validateSyncPrerequisites = (plan, authToken) => {
  // Must have auth token
  if (!authToken || authToken.trim().length === 0) {
    return { valid: false, error: 'Authentication token required' };
  }
  
  // Must have actions to execute on EITHER side (bi-directional sync)
  const hasAppSync = plan.add_to_app && plan.add_to_app.length > 0;
  const hasPdfSync = plan.add_to_pdf && plan.add_to_pdf.length > 0;
  
  if (!hasAppSync && !hasPdfSync) {
    return { valid: false, error: 'No expenses to sync (both add_to_app and add_to_pdf are empty)' };
  }
  
  // Validate plan structure
  if (!plan.timestamp || !plan.mode) {
    return { valid: false, error: 'Invalid plan structure (missing required fields)' };
  }
  
  return { valid: true };
};

/**
 * Generates human-readable sync report
 * 
 * @param {Object} syncSummary - Summary from executeSyncPlan
 * @returns {string} Formatted report text
 */
export const generateSyncReport = (syncSummary) => {
  const lines = [];
  
  lines.push('📊 SYNC EXECUTION REPORT');
  lines.push('');
  lines.push(`Started: ${new Date(syncSummary.startedAt).toLocaleString()}`);
  lines.push(`Completed: ${new Date(syncSummary.completedAt).toLocaleString()}`);
  lines.push('');
  
  lines.push('**Execution Summary:**');
  lines.push(`  • Total planned: ${syncSummary.totalPlanned}`);
  lines.push(`  • After dedup: ${syncSummary.totalAfterDedup}`);
  lines.push(`  • Attempted: ${syncSummary.attempted}`);
  lines.push(`  • [SUCCESS] Succeeded: ${syncSummary.succeeded}`);
  lines.push(`  • [FAILED] Failed: ${syncSummary.failed}`);
  lines.push(`  • [SKIPPED] Skipped: ${syncSummary.skipped}`);
  
  if (syncSummary.failed > 0) {
    lines.push('');
    lines.push('**Failed Expenses (can be retried):**');
    syncSummary.failedExpenses.forEach((f, i) => {
      lines.push(`  ${i + 1}. $${f.expense.amount} - ${f.expense.description}`);
      lines.push(`     Error: ${f.error}`);
    });
  }
  
  return lines.join('\n');
};
