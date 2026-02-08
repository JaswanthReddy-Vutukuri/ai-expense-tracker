/**
 * RECONCILIATION HANDLER - ORCHESTRATOR WITH LANGCHAIN
 * 
 * PURPOSE:
 * - Orchestrates complete reconciliation workflow
 * - Coordinates compare → plan → sync → report → explain pipeline
 * - Uses LangChain for natural language communication
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
 * 3. VALIDATE: Pre-flight checks before execution
 * 4. SYNC: Execute plan via CreateExpenseTool
 * 5. REPORT: Generate downloadable synced expense report with LangChain insights
 * 6. EXPLAIN: Generate natural language summary using LangChain
 * 7. RESPOND: Return comprehensive summary to user
 * 
 * TRUST & EXPLAINABILITY:
 * - Each stage is logged
 * - Decisions are deterministic and traceable
 * - Users see what will happen before it happens
 * - Full audit trail for compliance
 * 
 * LANGCHAIN INTEGRATION:
 * - Uses ChatOpenAI for natural language explanation
 * - Uses PromptTemplate for structured summaries
 * - Deterministic logic stays outside LLM (planning, sync execution)
 * - LLM only for: user communication, result explanation, report insights
 */

import axios from 'axios';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { handleComparison } from './comparison.handler.js';
import { createReconciliationPlan, summarizePlan } from '../reconcile/reconciliationPlanner.js';
import { executeSyncPlan, validateSyncPrerequisites, generateSyncReport } from '../reconcile/syncHandler.js';
import { generateSyncedExpenseReport, summarizeReport } from '../reports/reportGenerator.js';

const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000';

/**
 * Generates natural language explanation of reconciliation results using LangChain
 * 
 * WHY LANGCHAIN HERE:
 * - Converts technical sync summary to user-friendly language
 * - Provides context-aware explanations
 * - Adapts tone based on success/failure
 * 
 * @param {Object} reconciliationResult - Complete reconciliation results
 * @returns {Promise<string>} Natural language explanation
 */
const explainReconciliation = async (reconciliationResult) => {
  console.log('[Reconciliation Handler] Generating natural language explanation with LangChain...');
  
  const llm = new ChatOpenAI({
    modelName: 'gpt-4o-mini',
    temperature: 0.4 // Balanced: factual but friendly
  });
  
  const explanationTemplate = `You are a helpful financial assistant explaining reconciliation results to a user.

RECONCILIATION SUMMARY:
- Mode: {mode}
- PDF-only expenses found: {pdfOnlyCount}
- App-only expenses found: {appOnlyCount}
- Already matched: {matchedCount}
- Approved to sync to app: {approvedForApp}
- Sync succeeded: {syncSucceeded}
- Sync failed: {syncFailed}
- Sync skipped: {syncSkipped}
- Report generated: {reportGenerated}

SCENARIO:
{scenario}

SYNC DETAILS:
{syncReport}

REJECTED ITEMS:
{rejectedInfo}

Your task:
1. Explain what reconciliation found in simple terms
2. If no PDF expenses were synced to app (approvedForApp = 0), explain that the PDF and app are already in sync for financial data
3. Clearly state what was synced successfully (if any)
4. Mention the downloadable report if it was generated  
5. If there were failures, explain them empathetically
6. If expenses were rejected, explain why
7. Provide actionable next steps if needed
8. Keep tone friendly and professional

Generate a clear, concise explanation (3-5 paragraphs max).`;

  const prompt = PromptTemplate.fromTemplate(explanationTemplate);
  
  // Determine scenario for better LLM context
  const approvedForApp = reconciliationResult.plan.summary.approvedForApp;
  const approvedForPdf = reconciliationResult.plan.summary.approvedForPdf;
  
  let scenario = '';
  if (approvedForApp === 0 && approvedForPdf > 0) {
    scenario = 'PDF-only sync: No expenses needed to be added to app. Only generated report with app expenses.';
  } else if (approvedForApp > 0 && approvedForPdf === 0) {
    scenario = 'App-only sync: Added PDF expenses to app. No app-only expenses found.';
  } else if (approvedForApp > 0 && approvedForPdf > 0) {
    scenario = 'Bi-directional sync: Synced expenses to app AND generated report with app expenses.';
  } else {
    scenario = 'Already synced: All expenses matched. Generated comprehensive report.';
  }
  
  const formattedPrompt = await prompt.format({
    mode: reconciliationResult.plan.mode,
    pdfOnlyCount: reconciliationResult.plan.summary.totalPdfOnly,
    appOnlyCount: reconciliationResult.plan.summary.totalAppOnly,
    matchedCount: reconciliationResult.plan.summary.totalMatched,
    approvedForApp: approvedForApp,
    syncSucceeded: reconciliationResult.syncSummary?.succeeded || 0,
    syncFailed: reconciliationResult.syncSummary?.failed || 0,
    syncSkipped: reconciliationResult.syncSummary?.skipped || 0,
    reportGenerated: reconciliationResult.reportResult?.success ? 'Yes' : 'No',
    scenario,
    syncReport: reconciliationResult.syncReport || 'No sync performed',
    rejectedInfo: reconciliationResult.plan.summary.rejected > 0 
      ? `${reconciliationResult.plan.summary.rejected} expenses were rejected. Check details in sync report.`
      : 'No expenses were rejected'
  });
  
  const response = await llm.invoke(formattedPrompt);
  return response.content;
};

/**
 * Handles reconciliation/sync request with full pipeline
 * 
 * THIS IS THE MAIN RECONCILIATION ORCHESTRATOR
 * 
 * ENTERPRISE WORKFLOW:
 * 1. Compare PDF vs app expenses (structured diff)
 * 2. Generate reconciliation plan (deterministic logic)
 * 3. Validate prerequisites (safety checks)
 * 4. Execute sync (via CreateExpenseTool)
 * 5. Generate report (with LangChain insights)
 * 6. Explain results (LangChain natural language)
 * 7. Return comprehensive summary
 * 
 * WHY THIS IS TRUSTWORTHY:
 * - No LLM decides what to sync (deterministic rules)
 * - Each step is logged (full audit trail)
 * - Partial failures handled gracefully
 * - LangChain only for communication, not decisions
 * 
 * @param {string} userMessage - User's sync/reconcile request
 * @param {number} userId - User ID for data isolation
 * @param {string} authToken - JWT token for backend auth
 * @param {Object} options - Handler options
 * @param {boolean} options.dryRun - If true, only plan (don't execute)
 * @param {boolean} options.returnStructured - Return structured data instead of text
 * @returns {Promise<string>} Comprehensive reconciliation summary
 */
export const handleReconciliation = async (userMessage, userId, authToken, options = {}) => {
  const { dryRun = false, returnStructured = false } = options;
  
  console.log(`[Reconciliation Handler] Starting reconciliation workflow for user ${userId}`);
  console.log(`[Reconciliation Handler] Mode: ${dryRun ? 'DRY RUN (plan only)' : 'FULL EXECUTION'}`);
  
  try {
    // ========================================================================
    // STAGE 1: COMPARE
    // Get structured diff between PDF and app expenses
    // WHY: Provides factual basis for all decisions
    // ========================================================================
    console.log('[Reconciliation Handler] STAGE 1: Comparing PDF vs app expenses...');
    
    const structuredDiff = await handleComparison(
      userMessage,
      userId,
      authToken,
      { returnStructured: true } // Request structured output
    );
    
    if (structuredDiff.error) {
      return `❌ Cannot reconcile: ${structuredDiff.error}`;
    }
    
    console.log(`[Reconciliation Handler] Comparison complete:`);
    console.log(`  - PDF-only expenses: ${structuredDiff.pdfOnly.length}`);
    console.log(`  - App-only expenses: ${structuredDiff.appOnly.length}`);
    console.log(`  - Matched expenses: ${structuredDiff.matched.length}`);
    
    // Check if there's anything to sync
    if (structuredDiff.pdfOnly.length === 0 && structuredDiff.appOnly.length === 0) {
      return '✅ **No differences detected!**\n\nYour PDF and app expenses are fully synchronized. Everything is up to date.';
    }
    
    // ========================================================================
    // STAGE 2: PLAN
    // Create deterministic reconciliation plan
    // WHY: Separates decision-making from execution (safety)
    // ========================================================================
    console.log('[Reconciliation Handler] STAGE 2: Creating reconciliation plan...');
    
    // Fetch current app expenses for duplicate detection
    const appExpensesResponse = await axios.get(
      `${backendUrl}/api/expenses`,
      {
        headers: { 'Authorization': `Bearer ${authToken}` }
      }
    );
    const existingAppExpenses = appExpensesResponse.data?.data || [];
    
    const plan = createReconciliationPlan(structuredDiff, existingAppExpenses);
    const planSummary = summarizePlan(plan);
    
    console.log(`[Reconciliation Handler] Plan created (bi-directional):`);
    console.log(`  - Add to app: ${plan.summary.approvedForApp}`);
    console.log(`  - Add to PDF: ${plan.summary.approvedForPdf}`);
    console.log(`  - Ignored (matched): ${plan.summary.totalMatched}`);
    console.log(`  - Rejected (invalid): ${plan.summary.rejected}`);
    
    // Check if there's anything to sync after planning
    if (plan.summary.approvedForApp === 0 && plan.summary.approvedForPdf === 0) {
      return `✅ **No expenses to sync**\n\n${planSummary}\n\nAll valid expenses are already synchronized.`;
    }
    
    // If dry run, return plan without executing
    if (dryRun) {
      console.log('[Reconciliation Handler] DRY RUN mode - stopping before execution');
      return `📋 **DRY RUN - Reconciliation Plan (not executed)**\n\n${planSummary}\n\nTo execute this plan, use: "sync expenses" or "reconcile and sync"`;
    }
    
    // ========================================================================
    // STAGE 3: VALIDATE
    // Pre-flight checks before execution
    // WHY: Fail fast if requirements not met
    // ========================================================================
    console.log('[Reconciliation Handler] STAGE 3: Validating sync prerequisites...');
    
    const validation = validateSyncPrerequisites(plan, authToken);
    if (!validation.valid) {
      throw new Error(`Sync validation failed: ${validation.error}`);
    }
    
    console.log('[Reconciliation Handler] Validation passed');
    
    // ========================================================================
    // STAGE 4: SYNC
    // Execute plan via CreateExpenseTool
    // WHY: Tool enforces validation and auth consistently
    // ========================================================================
    console.log('[Reconciliation Handler] STAGE 4: Executing sync plan...');
    
    const syncSummary = await executeSyncPlan(plan, authToken, userId);
    const syncReport = generateSyncReport(syncSummary);
    
    console.log(`[Reconciliation Handler] Sync complete: ${syncSummary.succeeded}/${syncSummary.attempted} succeeded`);
    
    // ========================================================================
    // STAGE 5: GENERATE REPORT
    // Create synced expense report with LangChain-powered insights
    // WHY: Provides downloadable proof of reconciliation
    // ========================================================================
    console.log('[Reconciliation Handler] STAGE 5: Generating synced expense report...');
    
    const reportResult = await generateSyncedExpenseReport(
      authToken, 
      userId, 
      plan.add_to_pdf,
      {
        syncedCount: syncSummary.succeeded,
        matchedCount: plan.summary.totalMatched
      }
    );
    
    const reportSummary = summarizeReport(reportResult);
    
    console.log('[Reconciliation Handler] Report generation complete');
    if (reportResult.success) {
      console.log(`  - CSV: ${reportResult.files.csv.path}`);
      console.log(`  - HTML: ${reportResult.files.html.path}`);
    } else {
      console.warn(`  - Report generation failed: ${reportResult.error}`);
    }
    
    // ========================================================================
    // STAGE 6: EXPLAIN
    // Generate natural language explanation using LangChain
    // WHY: Converts technical summary to user-friendly communication
    // ========================================================================
    console.log('[Reconciliation Handler] STAGE 6: Generating explanation with LangChain...');
    
    const reconciliationResult = {
      plan,
      planSummary,
      syncSummary,
      syncReport,
      reportResult,
      reportSummary,
      timestamp: new Date().toISOString()
    };
    
    // If returnStructured, return raw data
    if (returnStructured) {
      return reconciliationResult;
    }
    
    // Generate natural language explanation
    const explanation = await explainReconciliation(reconciliationResult);
    
    // ========================================================================
    // STAGE 7: RESPOND
    // Compile comprehensive bi-directional sync summary
    // WHY: Transparency builds trust
    // ========================================================================
    const response = [];
    response.push('✅ **BI-DIRECTIONAL RECONCILIATION COMPLETE**');
    response.push('');
    response.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    response.push('');
    response.push(explanation);
    response.push('');
    response.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    response.push('');
    response.push('**TECHNICAL SUMMARY**');
    response.push('');
    
    // Show different message based on what was synced
    const hasAppSync = plan.summary.approvedForApp > 0;
    const hasPdfSync = plan.summary.approvedForPdf > 0;
    
    if (hasAppSync) {
      response.push(`📊 **Sync Statistics:**`);
      response.push(`  • Planned for app: ${plan.summary.approvedForApp}`);
      response.push(`  • Successfully synced: ${syncSummary.succeeded}`);
      response.push(`  • Failed: ${syncSummary.failed}`);
      response.push(`  • Skipped (validation): ${syncSummary.skipped}`);
      response.push('');
    } else {
      response.push(`📊 **Sync Result:**`);
      response.push(`  • No PDF expenses to add to app`);
      response.push(`  • ${plan.summary.totalMatched} expenses already matched`);
      if (hasPdfSync) {
        response.push(`  • ${plan.summary.approvedForPdf} app expenses included in report`);
      }
      response.push('');
    }
    
    // Add report download links
    if (reportResult.success) {
      response.push('📄 **Synced Expense Report:**');
      response.push(`  • Download CSV: ${reportResult.files.csv.filename}`);
      response.push(`  • Download HTML: ${reportResult.files.html.filename}`);
      response.push('');
      response.push('💡 **AI-Powered Insights:**');
      response.push(reportResult.intelligentSummary);
    } else {
      response.push('⚠️ **Report Generation:**');
      response.push(`  Could not generate report: ${reportResult.error}`);
    }
    
    if (plan.summary.rejected > 0) {
      response.push('');
      response.push(`⚠️ **${plan.summary.rejected} expenses were rejected:**`);
      plan.rejected.slice(0, 3).forEach((r, i) => {
        response.push(`  ${i + 1}. $${r.expense.amount} - ${r.expense.description}`);
        response.push(`     Reason: ${r.reason}`);
      });
      if (plan.summary.rejected > 3) {
        response.push(`  ... and ${plan.summary.rejected - 3} more`);
      }
    }
    
    response.push('');
    response.push('🔍 Need more details? Ask me about specific expenses or the sync report.');
    
    return response.join('\n');
    
  } catch (error) {
    console.error('[Reconciliation Handler] Error during reconciliation:', error);
    
    return `❌ **Reconciliation failed**\n\nError: ${error.message}\n\nPlease try again or contact support if the issue persists.`;
  }
};
