/**
 * SYNC & RECONCILE HANDLER
 * 
 * PURPOSE:
 * - Orchestrates complete reconciliation workflow
 * - Coordinates compare → plan → sync → report pipeline
 * - Provides unified interface for reconciliation operations
 * 
 * WHY THIS EXISTS:
 * - Separates multi-stage workflows from intent routing
 * - Provides single entry point for reconciliation
 * - Enables transactional workflow (rollback on failure)
 * - Clear separation of concerns
 * 
 * WORKFLOW STAGES:
 * 1. COMPARE: Get structured diff between PDF and app expenses
 * 2. PLAN: Deterministically decide which expenses to sync
 * 3. REVIEW: Present plan to user (optional confirmation)
 * 4. SYNC: Execute plan via MCP tools
 * 5. REPORT: Generate downloadable expense report
 * 6. RESPOND: Return comprehensive summary to user
 * 
 * TRUST & EXPLAINABILITY:
 * - Each stage is logged
 * - Decisions are deterministic and traceable
 * - Users see what will happen before it happens
 * - Full audit trail for compliance
 * 
 * ARCHITECTURE FIT:
 * - Called by intent router when intent = SYNC or RECONCILE
 * - Orchestrates calls to multiple modules
 * - Does NOT directly call backend APIs
 * - Uses only MCP tools for data operations
 */

import { handleRagCompare } from './ragCompareHandler.js';
import { createReconciliationPlan, summarizePlan } from '../reconcile/reconciliationPlanner.js';
import { executeSyncPlan, generateSyncReport, validateSyncPrerequisites } from '../reconcile/syncHandler.js';
import { generateExpenseReport, generateSyncedExpenseReport, summarizeReport } from '../reports/pdfGenerator.js';

/**
 * Handles sync/reconcile request with full pipeline
 * 
 * THIS IS THE MAIN RECONCILIATION ORCHESTRATOR
 * 
 * ENTERPRISE WORKFLOW:
 * 1. Compare PDF vs app expenses (structured diff)
 * 2. Generate reconciliation plan (deterministic logic)
 * 3. Validate prerequisites (safety checks)
 * 4. Execute sync (via MCP tools only)
 * 5. Generate report (downloadable proof)
 * 6. Return comprehensive summary
 * 
 * WHY THIS IS TRUSTWORTHY:
 * - No LLM decides what to sync (deterministic rules)
 * - Each step is logged (full audit trail)
 * - Partial failures handled gracefully
 * - Reports provide proof of reconciliation
 * 
 * @param {string} userMessage - User's sync/reconcile request
 * @param {string} authToken - JWT token for backend auth
 * @param {number} userId - User ID for data isolation
 * @param {Object} options - Handler options
 * @param {boolean} options.dryRun - If true, only plan (don't execute)
 * @returns {Promise<string>} Comprehensive reconciliation summary
 */
export const handleSyncReconcile = async (userMessage, authToken, userId, options = {}) => {
  const { dryRun = false } = options;
  
  console.log(`[Sync Handler] Starting reconciliation workflow for user ${userId}`);
  console.log(`[Sync Handler] Mode: ${dryRun ? 'DRY RUN (plan only)' : 'FULL EXECUTION'}`);
  
  try {
    // ========================================================================
    // STAGE 1: COMPARE
    // Get structured diff between PDF and app expenses
    // WHY: Provides factual basis for all decisions
    // ========================================================================
    console.log('[Sync Handler] STAGE 1: Comparing PDF vs app expenses...');
    
    const structuredDiff = await handleRagCompare(
      userMessage,
      authToken,
      userId,
      { returnStructured: true } // Request structured output
    );
    
    if (structuredDiff.error) {
      return `Cannot reconcile: ${structuredDiff.error}`;
    }
    
    console.log(`[Sync Handler] Comparison complete:`);
    console.log(`  - PDF-only expenses: ${structuredDiff.pdf_only.length}`);
    console.log(`  - App-only expenses: ${structuredDiff.app_only.length}`);
    console.log(`  - Matched expenses: ${structuredDiff.matched.length}`);
    
    if (structuredDiff.pdf_only.length === 0 && structuredDiff.app_only.length === 0) {
      return 'No differences detected! PDF and app expenses are fully synchronized.';
    }
    
    // ========================================================================
    // STAGE 2: PLAN
    // Create deterministic reconciliation plan
    // WHY: Separates decision-making from execution (safety)
    // ========================================================================
    console.log('[Sync Handler] STAGE 2: Creating reconciliation plan...');
    
    const plan = createReconciliationPlan(structuredDiff);
    const planSummary = summarizePlan(plan);
    
    console.log(`[Sync Handler] Plan created (bi-directional):`);
    console.log(`  - Add to app: ${plan.summary.approvedForApp || 0}`);
    console.log(`  - Add to PDF: ${plan.summary.approvedForPdf || 0}`);
    console.log(`  - Ignored (matched): ${plan.summary.totalMatched || 0}`);
    console.log(`  - Rejected (invalid): ${plan.summary.rejected || 0}`);
    
    if ((plan.summary.approvedForApp || 0) === 0 && (plan.summary.approvedForPdf || 0) === 0) {
      return `No expenses to sync.\n\n${planSummary}`;
    }
    
    // If dry run, return plan without executing
    if (dryRun) {
      console.log('[Sync Handler] DRY RUN mode - stopping before execution');
      return `DRY RUN - Reconciliation Plan (not executed):\n\n${planSummary}\n\nTo execute this plan, use the command: "sync expenses" or "reconcile and sync"`;
    }
    
    // ========================================================================
    // STAGE 3: VALIDATE
    // Pre-flight checks before execution
    // WHY: Fail fast if requirements not met
    // ========================================================================
    console.log('[Sync Handler] STAGE 3: Validating sync prerequisites...');
    
    const validation = validateSyncPrerequisites(plan, authToken, userId);
    if (!validation.valid) {
      throw new Error(`Sync validation failed: ${validation.error}`);
    }
    
    console.log('[Sync Handler] Validation passed');
    
    // ========================================================================
    // STAGE 4: SYNC
    // Execute plan via MCP tools
    // WHY: MCP tools enforce validation and auth
    // ========================================================================
    console.log('[Sync Handler] STAGE 4: Executing sync plan...');
    
    const syncSummary = await executeSyncPlan(plan, authToken, userId);
    const syncReport = generateSyncReport(syncSummary);
    
    console.log(`[Sync Handler] Sync complete: ${syncSummary.succeeded}/${syncSummary.totalActions} succeeded`);
    
    // ========================================================================
    // STAGE 5: REPORT
    // Generate synced expense report (merged app + PDF data)
    // WHY: Provides comprehensive view of all expenses after sync
    // ========================================================================
    console.log('[Sync Handler] STAGE 5: Generating synced expense report...');
    
    // Generate synced report that merges app expenses + add_to_pdf expenses
    const reportResult = await generateSyncedExpenseReport(authToken, userId, plan.add_to_pdf);
    const reportSummary = summarizeReport(reportResult);
    
    console.log('[Sync Handler] Synced report generated');
    console.log(`  - Report type: ${reportResult.reportType}`);
    console.log(`  - CSV path: ${reportResult.files.csv}`);
    console.log(`  - HTML path: ${reportResult.files.html}`);
    
    // ========================================================================
    // STAGE 6: RESPOND
    // Compile comprehensive bi-directional sync summary
    // WHY: Transparency builds trust
    // ========================================================================
    const lines = [];
    lines.push('✅ BI-DIRECTIONAL RECONCILIATION COMPLETE');
    lines.push('');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');
    lines.push('**SYNC SUMMARY (App ↔ PDF)**');
    lines.push('');
    // WHY THESE FIELDS: plan.summary contains PLANNING metrics (what was decided)
    // WHY NOT EXECUTION METRICS: Planning ≠ Execution (some may fail/skip)
    // Planning metrics show INTENT, execution metrics show OUTCOME
    lines.push(`📥 Planned for App: ${plan.summary.approvedForApp || 0} expenses`);
    lines.push(`📤 Planned for PDF: ${plan.summary.approvedForPdf || 0} expenses`);
    lines.push(`✓ Already Matched: ${plan.summary.totalMatched || 0} expenses`);
    if ((plan.summary.rejected || 0) > 0) {
      lines.push(`❌ Rejected (validation failed): ${plan.summary.rejected || 0} expenses`);
    }
    if ((plan.summary.duplicate || 0) > 0) {
      lines.push(`⊗ Duplicates detected: ${plan.summary.duplicate || 0} expenses`);
    }
    lines.push('');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');
    lines.push(syncReport);
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');
    lines.push(reportSummary);
    lines.push('');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');
    
    // WHY DIFFERENT CONDITIONS: Distinguish between failures and skips
    // Failures = retryable backend errors
    // Skips = validation errors (bad data)
    if ((syncSummary.failed || 0) > 0) {
      lines.push('⚠️  Some expenses failed to sync to app (backend errors).');
      lines.push('These can be retried by running reconciliation again.');
    }
    if ((syncSummary.skipped || 0) > 0) {
      lines.push('⚠️  Some expenses were skipped due to validation errors (e.g., invalid dates).');
      lines.push('These cannot be retried without fixing the source data.');
    }
    if ((syncSummary.succeeded || 0) > 0 && (syncSummary.failed || 0) === 0 && (syncSummary.skipped || 0) === 0) {
      if ((plan.summary.approvedForApp || 0) > 0 && (plan.summary.approvedForPdf || 0) > 0) {
        lines.push('🎉 Bi-directional sync complete! Both app and PDF are now synchronized.');
      } else if ((plan.summary.approvedForApp || 0) > 0) {
        lines.push('🎉 PDF expenses synced to app successfully!');
      } else if ((plan.summary.approvedForPdf || 0) > 0) {
        lines.push('🎉 App expenses added to synced PDF successfully!');
      }
    }
    
    console.log('[Sync Handler] Reconciliation workflow complete');
    
    return lines.join('\n');
    
  } catch (error) {
    console.error('[Sync Handler] Reconciliation workflow failed:', error.message);
    throw new Error(`Reconciliation failed: ${error.message}`);
  }
};

/**
 * Handles clarification requests about sync/reconcile
 * 
 * WHY CLARIFICATION:
 * - Users may not understand reconciliation workflow
 * - Provides educational responses
 * - Builds confidence in the system
 * 
 * @param {string} userMessage - User's question
 * @returns {string} Educational explanation
 */
export const explainReconciliation = () => {
  return `
**Expense Reconciliation Explained**

Reconciliation is the process of syncing expenses from your uploaded PDF statements into the app.

**How it works:**

1. **Compare** - I compare expenses in your PDF with expenses already tracked in the app
2. **Plan** - I deterministically decide which expenses should be synced (no guessing!)
3. **Review** - You can see the plan before executing (dry run mode)
4. **Sync** - Approved expenses are added to your app via backend APIs
5. **Report** - You get a downloadable report as proof of reconciliation

**Commands:**

- "compare PDF with app" - See what's different
- "plan reconciliation" - Create a sync plan (dry run)
- "sync expenses" - Execute the full reconciliation
- "generate expense report" - Download your expense data

**Safety Features:**

✓ No AI makes financial decisions (deterministic rules)
✓ Full audit trail (every action logged)
✓ Partial failure handling (some can fail without breaking all)
✓ Downloadable reports (proof for stakeholders)

Try: "compare my PDF expenses with app data" to start!
  `.trim();
};
