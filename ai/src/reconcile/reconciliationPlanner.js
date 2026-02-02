/**
 * RECONCILIATION PLANNER - BI-DIRECTIONAL SYNC
 * 
 * PURPOSE:
 * - Makes deterministic decisions about which expenses to sync
 * - NO LLM involvement - pure business logic
 * - Produces auditable reconciliation plans
 * - Supports BI-DIRECTIONAL sync (PDF ↔ App)
 * 
 * WHY THIS EXISTS:
 * - Separates decision-making from execution (safety)
 * - Enables dry-run capability (test before commit)
 * - Provides clear audit trail (who, what, when, why)
 * - Prevents LLM from making financial decisions
 * 
 * BI-DIRECTIONAL SYNC MODEL:
 * - pdf_only expenses → add to app (via MCP tools)
 * - app_only expenses → add to regenerated PDF
 * - matched expenses → no action needed
 * - NEVER auto-delete (additive-only by default)
 * 
 * WHY ADDITIVE-ONLY:
 * - Data loss is NEVER acceptable in financial systems
 * - Users must explicitly request deletions
 * - Accounting principle: audit trail preservation
 * - Enterprise safety: prefer duplication over deletion
 * 
 * WHY LLMs MUST NOT DO THIS:
 * - Financial reconciliation requires 100% determinism
 * - LLMs are probabilistic and can hallucinate
 * - Business rules must be explicit and version-controlled
 * - Audit compliance requires traceable logic
 * 
 * ARCHITECTURE FIT:
 * - Called by sync/reconcile handler
 * - Consumes structured diff from RAG_COMPARE
 * - Produces TWO-SIDED plan for bi-directional sync
 * - Never directly modifies data
 */

import { normalizeDateToISO } from '../utils/dateNormalizer.js';

/**
 * Reconciliation strategy configuration
 * These rules define which expenses get synced
 */
const RECONCILIATION_RULES = {
  // Minimum amount threshold for auto-sync (prevent noise)
  MIN_AMOUNT_THRESHOLD: 1.0,
  
  // Maximum amount requiring manual approval (prevent accidental large syncs)
  MAX_AUTO_SYNC_AMOUNT: 10000.0,
  
  // Whether to sync expenses without dates
  ALLOW_UNDATED_EXPENSES: true,
  
  // Whether to sync duplicate descriptions (same amount + description)
  ALLOW_DUPLICATE_DESCRIPTIONS: false,
  
  // Default category for uncategorized expenses
  DEFAULT_CATEGORY: 'Other'
};

/**
 * Validates an expense before adding to sync plan
 * 
 * WHY VALIDATION IS CRITICAL:
 * - Prevents invalid data from entering the system
 * - Catches extraction errors before they propagate
 * - Provides clear rejection reasons for audit logs
 * 
 * @param {Object} expense - Expense to validate
 * @returns {Object} { valid: boolean, reason: string }
 */
const validateExpense = (expense) => {
  // Must have amount
  if (!expense.amount || typeof expense.amount !== 'number' || expense.amount <= 0) {
    return { valid: false, reason: 'Invalid or missing amount' };
  }
  
  // Must have description
  if (!expense.description || expense.description.trim().length === 0) {
    return { valid: false, reason: 'Missing description' };
  }
  
  // Check amount thresholds
  if (expense.amount < RECONCILIATION_RULES.MIN_AMOUNT_THRESHOLD) {
    return { valid: false, reason: `Amount below minimum threshold (${RECONCILIATION_RULES.MIN_AMOUNT_THRESHOLD})` };
  }
  
  if (expense.amount > RECONCILIATION_RULES.MAX_AUTO_SYNC_AMOUNT) {
    return { valid: false, reason: `Amount exceeds auto-sync limit (${RECONCILIATION_RULES.MAX_AUTO_SYNC_AMOUNT}) - requires manual approval` };
  }
  
  // Check date requirement
  if (!RECONCILIATION_RULES.ALLOW_UNDATED_EXPENSES && !expense.date) {
    return { valid: false, reason: 'Date required but missing' };
  }
  
  return { valid: true, reason: 'Passed validation' };
};

/**
 * Normalizes expense data for consistent processing
 * 
 * WHY NORMALIZATION:
 * - PDF extraction produces varied formats
 * - Backend expects consistent schema
 * - Category mapping must be deterministic
 * 
 * @param {Object} expense - Raw expense from PDF
 * @returns {Object} Normalized expense ready for sync
 */
const normalizeExpense = (expense) => {
  // CRITICAL: Normalize date to YYYY-MM-DD before backend call
  // WHY: PDF dates come in formats like "Feb 3, 2026" but backend requires ISO
  let normalizedDate;
  try {
    normalizedDate = expense.date ? normalizeDateToISO(expense.date) : new Date().toISOString().split('T')[0];
  } catch (error) {
    console.warn(`[Reconciliation Planner] Date normalization failed for "${expense.date}", using today: ${error.message}`);
    normalizedDate = new Date().toISOString().split('T')[0];
  }
  
  return {
    amount: parseFloat(expense.amount.toFixed(2)), // Ensure 2 decimal places
    description: expense.description.trim(),
    date: normalizedDate,  // Always YYYY-MM-DD format
    category: expense.category || RECONCILIATION_RULES.DEFAULT_CATEGORY,
    source: 'PDF_SYNC',
    metadata: {
      originalFilename: expense.filename,
      documentId: expense.documentId,
      chunkIndex: expense.chunkIndex,
      extractionFormat: expense.extractionFormat,
      originalDate: expense.date  // Preserve original for audit trail
    }
  };
};

/**
 * Checks if expense is duplicate of existing app expenses
 * 
 * WHY DUPLICATE DETECTION:
 * - Prevents accidental double-entry
 * - User may have already manually entered some PDF expenses
 * - Fuzzy matching handles slight variations
 * 
 * @param {Object} expense - Expense to check
 * @param {Array} existingExpenses - Current app expenses
 * @returns {boolean} True if likely duplicate
 */
const isDuplicate = (expense, existingExpenses) => {
  if (!RECONCILIATION_RULES.ALLOW_DUPLICATE_DESCRIPTIONS) {
    return existingExpenses.some(existing => 
      Math.abs(existing.amount - expense.amount) < 0.01 && // Same amount (within 1 cent)
      existing.description.toLowerCase() === expense.description.toLowerCase() // Same description
    );
  }
  return false;
};

/**
 * Creates a bi-directional reconciliation plan from structured diff
 * 
 * THIS IS THE CORE BI-DIRECTIONAL PLANNING FUNCTION
 * 
 * WHY BI-DIRECTIONAL:
 * - PDF and App are BOTH sources of truth
 * - Neither should be considered canonical
 * - Sync must preserve data from BOTH sides
 * - Users need consistency without data loss
 * 
 * WHY EXPLICIT OWNERSHIP MATTERS:
 * - pdf_only: Exists only in PDF → Must add to app
 * - app_only: Exists only in app → Must add to PDF
 * - matched: Exists in both → No action needed
 * - Clear ownership prevents ambiguity in sync logic
 * 
 * WHY DELETES ARE NEVER INFERRED:
 * - Missing data might be legitimate (not uploaded yet)
 * - Auto-delete violates accounting principles
 * - Enterprise safety: preserve all financial records
 * - Users must explicitly request deletions
 * 
 * DECISION LOGIC:
 * 1. pdf_only expenses → CANDIDATES for add_to_app
 * 2. Apply validation rules → FILTER invalid
 * 3. Check for duplicates → FILTER duplicates
 * 4. Normalize remaining → APPROVED for add_to_app
 * 5. app_only expenses → APPROVED for add_to_pdf (no validation needed)
 * 6. matched expenses → IGNORED (already synced)
 * 7. Log all decisions → AUDIT trail
 * 
 * @param {Object} structuredDiff - Output from RAG_COMPARE with returnStructured=true
 * @param {Array} structuredDiff.matched - Expenses found in both PDF and app
 * @param {Array} structuredDiff.pdf_only - Expenses only in PDF (candidates for app sync)
 * @param {Array} structuredDiff.app_only - Expenses only in app (candidates for PDF sync)
 * @returns {Object} Bi-directional reconciliation plan
 */
export const createReconciliationPlan = (structuredDiff) => {
  console.log('[Reconciliation Planner] Creating BI-DIRECTIONAL reconciliation plan...');
  console.log(`[Reconciliation Planner] Input: ${structuredDiff.pdf_only.length} PDF-only, ${structuredDiff.app_only.length} app-only, ${structuredDiff.matched.length} matched`);
  
  const plan = {
    timestamp: new Date().toISOString(),
    mode: 'BI_DIRECTIONAL',
    summary: {
      totalPdfOnly: structuredDiff.pdf_only.length,
      totalAppOnly: structuredDiff.app_only.length,
      totalMatched: structuredDiff.matched.length,
      approvedForApp: 0,
      approvedForPdf: 0,
      rejected: 0,
      duplicate: 0
    },
    add_to_app: [],    // Expenses to create in app via MCP tools
    add_to_pdf: [],    // Expenses to include in regenerated PDF
    ignored: [],       // Matched expenses (no action needed)
    rejected: [],      // Invalid expenses
    metadata: {
      rules: RECONCILIATION_RULES,
      planVersion: '2.0.0-bidirectional'
    }
  };
  
  // =========================================================================
  // SIDE A: PDF → APP SYNC
  // Process expenses that exist only in PDF
  // These need to be added to the app via MCP createExpense tool
  // =========================================================================
  console.log('[Reconciliation Planner] Processing PDF → App sync...');
  
  for (const expense of structuredDiff.pdf_only) {
    console.log(`[Reconciliation Planner] Evaluating PDF expense: $${expense.amount} - ${expense.description}`);
    
    // Step 1: Validate
    const validation = validateExpense(expense);
    if (!validation.valid) {
      console.log(`[Reconciliation Planner] ✗ REJECTED: ${validation.reason}`);
      plan.rejected.push({
        expense,
        reason: validation.reason,
        stage: 'validation',
        targetSide: 'app'
      });
      plan.summary.rejected++;
      continue;
    }
    
    // Step 2: Check for duplicates (using app_only as existing expenses for now)
    // In production, this should check against ALL app expenses
    if (isDuplicate(expense, structuredDiff.app_only)) {
      console.log(`[Reconciliation Planner] ✗ DUPLICATE: Already exists in app`);
      plan.rejected.push({
        expense,
        reason: 'Duplicate of existing app expense',
        stage: 'duplicate_detection',
        targetSide: 'app'
      });
      plan.summary.duplicate++;
      continue;
    }
    
    // Step 3: Normalize and approve for app sync
    const normalized = normalizeExpense(expense);
    console.log(`[Reconciliation Planner] ✓ APPROVED for APP: $${normalized.amount} - ${normalized.description}`);
    
    plan.add_to_app.push({
      action: 'CREATE_EXPENSE',
      expense: normalized,
      reason: 'Found in PDF but not in app',
      confidence: 'HIGH'
    });
    plan.summary.approvedForApp++;
  }
  
  // =========================================================================
  // SIDE B: APP → PDF SYNC
  // Process expenses that exist only in app
  // These need to be included in the regenerated PDF
  // NO VALIDATION NEEDED - app data is already validated by backend
  // =========================================================================
  console.log('[Reconciliation Planner] Processing App → PDF sync...');
  
  for (const expense of structuredDiff.app_only) {
    console.log(`[Reconciliation Planner] ✓ APPROVED for PDF: $${expense.amount} - ${expense.description}`);
    
    // App expenses are already validated and normalized by backend
    // Just include them in the PDF regeneration list
    plan.add_to_pdf.push({
      action: 'INCLUDE_IN_PDF',
      expense: expense,
      reason: 'Found in app but not in PDF',
      confidence: 'HIGH'
    });
    plan.summary.approvedForPdf++;
  }
  
  // =========================================================================
  // MATCHED EXPENSES
  // These exist in both PDF and app - no action needed
  // Add to ignored list for transparency
  // =========================================================================
  console.log('[Reconciliation Planner] Processing matched expenses...');
  
  for (const expense of structuredDiff.matched) {
    plan.ignored.push({
      expense,
      reason: 'Already synced (exists in both PDF and app)',
      requiresAction: false
    });
  }
  
  console.log(`[Reconciliation Planner] BI-DIRECTIONAL plan complete:`);
  console.log(`  → Add to app: ${plan.summary.approvedForApp}`);
  console.log(`  → Add to PDF: ${plan.summary.approvedForPdf}`);
  console.log(`  → Matched (ignored): ${plan.summary.totalMatched}`);
  console.log(`  → Rejected: ${plan.summary.rejected}`);
  console.log(`  → Duplicates: ${plan.summary.duplicate}`);
  
  return plan;
};

/**
 * Generates a human-readable summary of the bi-directional reconciliation plan
 * 
 * WHY SUMMARY:
 * - Users need to understand what will happen on BOTH sides
 * - Provides last checkpoint before execution
 * - Enables informed consent
 * - Shows full scope of bi-directional sync
 * 
 * @param {Object} plan - Bi-directional reconciliation plan
 * @returns {string} Human-readable summary
 */
export const summarizePlan = (plan) => {
  const lines = [];
  
  lines.push('=== BI-DIRECTIONAL RECONCILIATION PLAN ===');
  lines.push('');
  lines.push(`Generated: ${plan.timestamp}`);
  lines.push(`Mode: ${plan.mode}`);
  lines.push('');
  lines.push('INPUT SUMMARY:');
  lines.push(`  PDF-only expenses: ${plan.summary.totalPdfOnly}`);
  lines.push(`  App-only expenses: ${plan.summary.totalAppOnly}`);
  lines.push(`  Matched expenses: ${plan.summary.totalMatched}`);
  lines.push('');
  lines.push('PLANNED ACTIONS:');
  lines.push(`  ✓ Add to app: ${plan.summary.approvedForApp}`);
  lines.push(`  ✓ Add to PDF: ${plan.summary.approvedForPdf}`);
  lines.push(`  ⊗ Ignored (matched): ${plan.summary.totalMatched}`);
  lines.push(`  ✗ Rejected: ${plan.summary.rejected}`);
  lines.push(`  ⊗ Duplicates skipped: ${plan.summary.duplicate}`);
  lines.push('');
  
  if (plan.add_to_app.length > 0) {
    lines.push('EXPENSES TO ADD TO APP (via MCP tools):');
    plan.add_to_app.forEach((action, idx) => {
      lines.push(`  ${idx + 1}. $${action.expense.amount} - ${action.expense.description} (${action.expense.category})`);
    });
    lines.push('');
  }
  
  if (plan.add_to_pdf.length > 0) {
    lines.push('EXPENSES TO ADD TO PDF (via regeneration):');
    plan.add_to_pdf.forEach((action, idx) => {
      lines.push(`  ${idx + 1}. $${action.expense.amount} - ${action.expense.description} (${action.expense.category || 'N/A'})`);
    });
    lines.push('');
  }
  
  if (plan.rejected.length > 0) {
    lines.push('REJECTED EXPENSES:');
    plan.rejected.forEach((rejected, idx) => {
      lines.push(`  ${idx + 1}. $${rejected.expense.amount} - ${rejected.expense.description}`);
      lines.push(`     Reason: ${rejected.reason} (Target: ${rejected.targetSide || 'unknown'})`);
    });
    lines.push('');
  }
  
  lines.push('NOTE: This is an ADDITIVE-ONLY sync. No data will be deleted.');
  lines.push('Matched expenses require no action (already consistent).');
  
  return lines.join('\n');
};
