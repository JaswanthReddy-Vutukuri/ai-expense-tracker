/**
 * REPORT GENERATOR - BI-DIRECTIONAL SYNC SUPPORT WITH LANGCHAIN
 * 
 * PURPOSE:
 * - Generates synced expense reports from merged data
 * - Creates downloadable artifacts for reconciliation
 * - Provides audit trail documentation
 * - Uses LangChain for intelligent summaries
 * 
 * WHY THIS EXISTS:
 * - Users need proof of synced expenses
 * - Stakeholders need reconciliation reports
 * - Auditors need expense documentation
 * - Creates paper trail for financial records
 * 
 * BI-DIRECTIONAL SYNC SUPPORT:
 * - Accepts expenses from BOTH app and PDF
 * - Merges data into single unified report
 * - Clearly labels as "Synced" to prevent confusion
 * - Distinguishes from original uploaded PDFs
 * 
 * LANGCHAIN INTEGRATION:
 * - Uses ChatOpenAI for intelligent report summaries
 * - Generates natural language insights
 * - Keeps deterministic data formatting in pure code
 * - LLM only for summarization, not data processing
 * 
 * WHY PDFs ARE REGENERATED (NOT PATCHED):
 * - Patching PDFs is error-prone and complex
 * - Regeneration ensures data integrity
 * - Clean formatting guarantees readability
 * - Full control over output format
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { ListExpensesTool } from '../tools/listExpenses.tool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Report storage directory
const REPORTS_DIR = path.join(__dirname, '../../data/reports');

/**
 * Ensures report directory exists
 */
const ensureReportsDir = async () => {
  try {
    await fs.mkdir(REPORTS_DIR, { recursive: true });
  } catch (error) {
    console.error('[Report Generator] Error creating reports directory:', error.message);
  }
};

/**
 * Formats currency consistently
 */
const formatCurrency = (amount) => {
  return `$${parseFloat(amount).toFixed(2)}`;
};

/**
 * Formats date consistently
 */
const formatDate = (date) => {
  if (!date) return 'N/A';
  try {
    return new Date(date).toISOString().split('T')[0];
  } catch {
    return date;
  }
};

/**
 * Generates intelligent report summary using LangChain
 * 
 * WHY LANGCHAIN HERE:
 * - Converts raw expense data into business insights
 * - Identifies spending patterns and anomalies
 * - Provides actionable recommendations
 * - Natural language makes reports more accessible
 * 
 * @param {Array} expenses - List of expenses
 * @param {Object} syncStats - Statistics from sync operation
 * @returns {Promise<string>} Natural language summary
 */
const generateIntelligentSummary = async (expenses, syncStats) => {
  console.log('[Report Generator] Generating intelligent summary with LangChain...');
  
  try {
    const llm = new ChatOpenAI({
      modelName: 'gpt-4o-mini',
      temperature: 0.3 // Low temperature for factual summaries
    });
    
    // Calculate spending by category
    const categoryTotals = expenses.reduce((acc, exp) => {
      const cat = exp.category || 'Other';
      acc[cat] = (acc[cat] || 0) + parseFloat(exp.amount);
      return acc;
    }, {});
    
    const topCategories = Object.entries(categoryTotals)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([cat, amount]) => `${cat}: ${formatCurrency(amount)}`)
      .join(', ');
    
    const totalAmount = expenses.reduce((sum, exp) => sum + parseFloat(exp.amount || 0), 0);
    const avgAmount = expenses.length > 0 ? totalAmount / expenses.length : 0;
    
    const summaryTemplate = `You are a financial analyst generating an expense report summary.

EXPENSE DATA:
- Total expenses: {totalExpenses}
- Total amount: {totalAmount}
- Average expense: {avgAmount}
- Top spending categories: {topCategories}
- Date range: {dateRange}

SYNC STATISTICS:
- New expenses added: {syncedCount}
- Already matched: {matchedCount}
- Report type: Synced (combines app + PDF data)

Generate a concise, professional summary (2-3 paragraphs) that:
1. Highlights key spending insights
2. Mentions the most significant categories
3. Notes any patterns or interesting observations
4. Confirms data was successfully synced

Keep the tone professional but friendly. Focus on actionable insights.`;

    const prompt = PromptTemplate.fromTemplate(summaryTemplate);
    
    const dateRange = expenses.length > 0 
      ? `${formatDate(expenses[0].date)} to ${formatDate(expenses[expenses.length - 1].date)}`
      : 'N/A';
    
    const formattedPrompt = await prompt.format({
      totalExpenses: expenses.length,
      totalAmount: formatCurrency(totalAmount),
      avgAmount: formatCurrency(avgAmount),
      topCategories,
      dateRange,
      syncedCount: syncStats.syncedCount || 0,
      matchedCount: syncStats.matchedCount || 0
    });
    
    const response = await llm.invoke(formattedPrompt);
    return response.content;
  } catch (error) {
    console.error('[Report Generator] Error generating intelligent summary:', error.message);
    // Fallback to basic summary
    return `This synced report contains ${expenses.length} expenses. Data has been successfully merged from both app and PDF sources.`;
  }
};

/**
 * Generates CSV expense report
 * 
 * WHY CSV:
 * - Universal compatibility
 * - No AI needed for data formatting
 * - Deterministic and reproducible
 */
const generateCSV = (expenses, metadata) => {
  const lines = [];
  
  // Header with metadata
  lines.push(`# Synced Expense Report (App + PDF)`);
  lines.push(`# Generated: ${metadata.generatedAt}`);
  lines.push(`# User ID: ${metadata.userId}`);
  lines.push(`# Total Expenses: ${expenses.length}`);
  lines.push(`# Total Amount: ${formatCurrency(metadata.totalAmount)}`);
  lines.push(`# Source: Bi-directional sync`);
  lines.push('');
  
  // Column headers
  lines.push('Date,Description,Category,Amount,ID');
  
  // Data rows
  expenses.forEach(expense => {
    const row = [
      formatDate(expense.date || expense.expense_date),
      `"${(expense.description || '').replace(/"/g, '""')}"`,
      expense.category_name || expense.category || 'Other',
      expense.amount,
      expense.id || 'N/A'
    ].join(',');
    lines.push(row);
  });
  
  // Footer with summary
  lines.push('');
  lines.push(`# Summary: ${expenses.length} expenses totaling ${formatCurrency(metadata.totalAmount)}`);
  lines.push(`# This is a SYNCED report combining data from app and uploaded PDFs`);
  
  return lines.join('\n');
};

/**
 * Generates HTML expense report with LangChain summary
 * 
 * WHY HTML:
 * - Can be printed to PDF by browsers
 * - Supports rich formatting
 * - Includes AI-generated insights
 */
const generateHTML = (expenses, metadata, intelligentSummary) => {
  const totalAmount = formatCurrency(metadata.totalAmount);
  
  const rows = expenses.map(expense => `
    <tr>
      <td>${formatDate(expense.date || expense.expense_date)}</td>
      <td>${expense.description || ''}</td>
      <td>${expense.category_name || expense.category || 'Other'}</td>
      <td style="text-align: right;">${formatCurrency(expense.amount)}</td>
      <td style="text-align: center;">${expense.id || 'N/A'}</td>
    </tr>
  `).join('');
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Synced Expense Report</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 40px;
      color: #333;
    }
    h1 {
      color: #2c3e50;
      border-bottom: 3px solid #3498db;
      padding-bottom: 10px;
    }
    .sync-badge {
      background: #27ae60;
      color: white;
      padding: 5px 15px;
      border-radius: 15px;
      font-size: 12px;
      font-weight: bold;
      display: inline-block;
      margin-left: 10px;
    }
    .metadata {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 5px;
      margin-bottom: 20px;
    }
    .summary {
      background: #e8f5e9;
      padding: 15px;
      border-left: 4px solid #27ae60;
      margin-bottom: 20px;
      border-radius: 5px;
    }
    .summary h3 {
      margin-top: 0;
      color: #27ae60;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    th {
      background: #34495e;
      color: white;
      padding: 12px;
      text-align: left;
      font-weight: bold;
    }
    td {
      padding: 10px;
      border-bottom: 1px solid #ddd;
    }
    tr:hover {
      background: #f5f5f5;
    }
    .footer {
      margin-top: 30px;
      padding: 15px;
      background: #ecf0f1;
      border-radius: 5px;
      text-align: center;
    }
  </style>
</head>
<body>
  <h1>
    Synced Expense Report
    <span class="sync-badge">RECONCILED</span>
  </h1>
  
  <div class="metadata">
    <strong>Generated:</strong> ${new Date(metadata.generatedAt).toLocaleString()}<br>
    <strong>User ID:</strong> ${metadata.userId}<br>
    <strong>Report ID:</strong> ${metadata.reportId}<br>
    <strong>Total Expenses:</strong> ${expenses.length}<br>
    <strong>Total Amount:</strong> ${totalAmount}<br>
    <strong>Source:</strong> Bi-directional sync (App + PDF)
  </div>
  
  <div class="summary">
    <h3>📊 Intelligent Summary</h3>
    <p>${intelligentSummary.replace(/\n/g, '<br>')}</p>
  </div>
  
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Description</th>
        <th>Category</th>
        <th>Amount</th>
        <th>ID</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  
  <div class="footer">
    <p><strong>Total: ${totalAmount}</strong></p>
    <p style="font-size: 12px; color: #7f8c8d;">
      This is a synced report combining data from your app and uploaded PDF documents.<br>
      Generated automatically after successful reconciliation.
    </p>
  </div>
</body>
</html>
  `.trim();
};

/**
 * Generates synced expense report after reconciliation
 * 
 * THIS IS THE MAIN REPORT GENERATION FUNCTION
 * 
 * PROCESS:
 * 1. Fetch latest expenses via ListExpensesTool
 * 2. Merge with add_to_pdf expenses (if any)
 * 3. Generate intelligent summary using LangChain
 * 4. Create CSV and HTML reports
 * 5. Save to disk
 * 6. Return download links
 * 
 * @param {string} authToken - JWT token
 * @param {number} userId - User ID
 * @param {Array} addToPdfExpenses - Expenses to include in PDF (from plan.add_to_pdf)
 * @param {Object} syncStats - Statistics from sync operation
 * @returns {Promise<Object>} Report metadata and file paths
 */
export const generateSyncedExpenseReport = async (authToken, userId, addToPdfExpenses = [], syncStats = {}) => {
  console.log(`[Report Generator] Generating SYNCED expense report for user ${userId}`);
  console.log(`[Report Generator] add_to_pdf expenses: ${addToPdfExpenses.length}`);
  
  await ensureReportsDir();
  
  try {
    // Step 1: Fetch all current app expenses via ListExpensesTool
    const listTool = new ListExpensesTool(authToken, { userId });
    
    // Call with empty args to get all expenses
    const listResult = await listTool._call({});
    
    console.log('[Report Generator] List result type:', typeof listResult);
    
    // Parse tool result (it returns a formatted string)
    let appExpenses = [];
    
    // Try to extract expenses from tool response
    // ListExpensesTool returns: "Found X expenses: \n[expense details]"
    // We need to fetch directly from backend for structured data
    const axios = (await import('axios')).default;
    const response = await axios.get(
      `${process.env.BACKEND_BASE_URL || 'http://localhost:3000'}/api/expenses`,
      {
        headers: { 'Authorization': `Bearer ${authToken}` },
        params: { limit: 1000 }
      }
    );
    
    appExpenses = response.data?.data || [];
    
    console.log(`[Report Generator] Fetched ${appExpenses.length} app expenses`);
    
    // Step 2: Merge app expenses with add_to_pdf expenses
    const mergedExpenses = [...appExpenses];
    
    for (const action of addToPdfExpenses) {
      const expense = action.expense;
      // Check if already exists (by ID)
      const exists = appExpenses.some(e => e.id && expense.id && e.id === expense.id);
      if (!exists) {
        mergedExpenses.push(expense);
      }
    }
    
    console.log(`[Report Generator] Merged total: ${mergedExpenses.length} expenses`);
    
    if (mergedExpenses.length === 0) {
      console.warn('[Report Generator] No expenses to include in synced report');
      return {
        success: false,
        error: 'No expenses available for synced report',
        reportType: 'SYNCED'
      };
    }
    
    // Step 3: Calculate summary
    const totalAmount = mergedExpenses.reduce((sum, exp) => sum + parseFloat(exp.amount || 0), 0);
    
    const metadata = {
      generatedAt: new Date().toISOString(),
      userId,
      totalExpenses: mergedExpenses.length,
      totalAmount,
      reportId: `synced_report_${Date.now()}`,
      reportType: 'SYNCED'
    };
    
    // Step 4: Generate intelligent summary using LangChain
    const intelligentSummary = await generateIntelligentSummary(mergedExpenses, syncStats);
    
    // Step 5: Generate reports in multiple formats
    const csvContent = generateCSV(mergedExpenses, metadata);
    const htmlContent = generateHTML(mergedExpenses, metadata, intelligentSummary);
    
    // Step 6: Save to disk with "synced" prefix
    const timestamp = Date.now();
    const csvFilename = `synced_expense_report_${userId}_${timestamp}.csv`;
    const htmlFilename = `synced_expense_report_${userId}_${timestamp}.html`;
    
    const csvPath = path.join(REPORTS_DIR, csvFilename);
    const htmlPath = path.join(REPORTS_DIR, htmlFilename);
    
    await fs.writeFile(csvPath, csvContent, 'utf-8');
    await fs.writeFile(htmlPath, htmlContent, 'utf-8');
    
    console.log(`[Report Generator] ✓ SYNCED report generated successfully`);
    console.log(`[Report Generator]   CSV: ${csvPath}`);
    console.log(`[Report Generator]   HTML: ${htmlPath}`);
    
    // Step 7: Return metadata
    return {
      success: true,
      reportId: metadata.reportId,
      reportType: 'SYNCED',
      intelligentSummary,
      files: {
        csv: {
          path: csvPath,
          filename: csvFilename,
          url: `/reports/${csvFilename}`
        },
        html: {
          path: htmlPath,
          filename: htmlFilename,
          url: `/reports/${htmlFilename}`
        }
      },
      metadata: {
        totalExpenses: mergedExpenses.length,
        totalAmount: formatCurrency(totalAmount),
        generatedAt: metadata.generatedAt,
        source: 'Bi-directional sync (App + PDF)'
      }
    };
  } catch (error) {
    console.error('[Report Generator] Error generating synced report:', error.message);
    return {
      success: false,
      error: `Failed to generate synced expense report: ${error.message}`,
      reportType: 'SYNCED'
    };
  }
};

/**
 * Generates human-readable report summary
 * 
 * @param {Object} reportResult - Report generation result
 * @returns {string} Formatted summary
 */
export const summarizeReport = (reportResult) => {
  if (!reportResult.success) {
    return `❌ Report generation failed: ${reportResult.error}`;
  }
  
  const lines = [];
  lines.push('📄 **Synced Expense Report Generated**');
  lines.push('');
  lines.push(`Report ID: ${reportResult.reportId}`);
  lines.push(`Total Expenses: ${reportResult.metadata.totalExpenses}`);
  lines.push(`Total Amount: ${reportResult.metadata.totalAmount}`);
  lines.push('');
  lines.push('📥 **Download Links:**');
  lines.push(`  • CSV: ${reportResult.files.csv.filename}`);
  lines.push(`  • HTML: ${reportResult.files.html.filename}`);
  
  return lines.join('\n');
};
