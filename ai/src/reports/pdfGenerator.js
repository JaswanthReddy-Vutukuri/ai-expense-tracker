/**
 * PDF REPORT GENERATOR - BI-DIRECTIONAL SYNC SUPPORT
 * 
 * PURPOSE:
 * - Generates synced expense reports from merged data
 * - Creates downloadable artifacts for reconciliation
 * - Provides audit trail documentation
 * - NO AI involvement - pure data formatting
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
 * WHY PDFs ARE REGENERATED (NOT PATCHED):
 * - Patching PDFs is error-prone and complex
 * - Regeneration ensures data integrity
 * - Clean formatting guarantees readability
 * - Avoids corruption and maintains audit quality
 * - Full control over output format
 * 
 * WHY AI IS NOT USED:
 * - Financial documents must be deterministic
 * - No room for hallucinations or creativity
 * - Formatting is pure data transformation
 * - Audit compliance requires reproducibility
 * 
 * ARCHITECTURE FIT:
 * - Called by sync/reconcile handler after app sync completes
 * - Accepts merged expense list (app + PDF expenses)
 * - Generates CSV format (universally compatible)
 * - Can be converted to PDF by frontend/external tools
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { listExpensesTool } from '../mcp/tools/listExpenses.js';

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
    console.error('[PDF Generator] Error creating reports directory:', error.message);
  }
};

/**
 * Formats currency consistently
 * 
 * @param {number} amount - Amount to format
 * @returns {string} Formatted amount
 */
const formatCurrency = (amount) => {
  return `$${parseFloat(amount).toFixed(2)}`;
};

/**
 * Formats date consistently
 * 
 * @param {string} date - ISO date string
 * @returns {string} Formatted date (YYYY-MM-DD)
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
 * Generates CSV expense report
 * 
 * WHY CSV:
 * - Universal compatibility (Excel, Google Sheets, etc.)
 * - No external dependencies required
 * - Easy to parse programmatically
 * - Can be converted to PDF via external tools
 * - Lightweight and fast
 * 
 * CSV STRUCTURE:
 * Date,Description,Category,Amount,ID
 * 
 * @param {Array} expenses - Expense data from app
 * @param {Object} metadata - Report metadata
 * @returns {string} CSV content
 */
const generateCSV = (expenses, metadata) => {
  const lines = [];
  
  // Header with metadata - clearly mark as synced
  lines.push(`# Synced Expense Report (App + PDF)`);
  lines.push(`# Generated: ${metadata.generatedAt}`);
  lines.push(`# User ID: ${metadata.userId}`);
  lines.push(`# Total Expenses: ${expenses.length}`);
  lines.push(`# Total Amount: ${formatCurrency(metadata.totalAmount)}`);
  lines.push(`# Source: Bi-directional sync`);
  lines.push('');
  
  // Column headers
  lines.push('Date,Description,Category,Amount,Source,ID');
  
  // Data rows
  expenses.forEach(expense => {
    const row = [
      formatDate(expense.date),
      `"${expense.description.replace(/"/g, '""')}"`, // Escape quotes
      expense.category || 'Other',
      expense.amount,
      expense.source || 'App', // Mark source (App or PDF)
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
 * Generates HTML expense report
 * 
 * WHY HTML:
 * - Can be printed to PDF by browsers
 * - Supports rich formatting
 * - Easy to view in any environment
 * - Can be styled with CSS
 * 
 * @param {Array} expenses - Expense data from app
 * @param {Object} metadata - Report metadata
 * @returns {string} HTML content
 */
const generateHTML = (expenses, metadata) => {
  const totalAmount = formatCurrency(metadata.totalAmount);
  
  const rows = expenses.map(expense => `
    <tr>
      <td>${formatDate(expense.date)}</td>
      <td>${expense.description}</td>
      <td>${expense.category || 'Other'}</td>
      <td style="text-align: right;">${formatCurrency(expense.amount)}</td>
      <td style="text-align: center;">${expense.source || 'App'}</td>
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
    .important-notice {
      background: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 15px;
      margin-bottom: 20px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    th {
      background: #3498db;
      color: white;
      padding: 12px;
      text-align: left;
    }
    td {
      padding: 10px;
      border-bottom: 1px solid #ddd;
    }
    tr:hover {
      background: #f5f5f5;
    }
    .summary {
      background: #e8f4f8;
      padding: 15px;
      border-radius: 5px;
      font-weight: bold;
      text-align: right;
    }
    .print-button {
      background: #3498db;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 5px;
      cursor: pointer;
      font-size: 14px;
      margin-bottom: 20px;
    }
    .print-button:hover {
      background: #2980b9;
    }
    @media print {
      .print-button { display: none; }
    }
  </style>
</head>
<body>
  <button class="print-button" onclick="window.print()">Print / Save as PDF</button>
  
  <h1>
    Synced Expense Report
    <span class="sync-badge">SYNCED</span>
  </h1>
  
  <div class="important-notice">
    <strong>📌 Important:</strong> This is a SYNCED expense report combining data from your app and uploaded PDF statements.
    It represents the complete, reconciled view of all your expenses.
  </div>
  
  <div class="metadata">
    <p><strong>Generated:</strong> ${metadata.generatedAt}</p>
    <p><strong>User ID:</strong> ${metadata.userId}</p>
    <p><strong>Total Expenses:</strong> ${expenses.length}</p>
    <p><strong>Source:</strong> Bi-directional sync (App + PDF)</p>
  </div>
  
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Description</th>
        <th>Category</th>
        <th>Amount</th>
        <th>Source</th>
        <th>ID</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  
  <div class="summary">
    Total Amount: ${totalAmount}
  </div>
</body>
</html>
  `.trim();
};

/**
 * Generates synced expense report from merged data (bi-directional sync)
 * 
 * THIS IS THE BI-DIRECTIONAL SYNC REPORT GENERATOR
 * 
 * PURPOSE:
 * - Accepts expenses from BOTH app and add_to_pdf list
 * - Merges into single unified report
 * - Clearly labels as "Synced" report
 * - Provides complete view of all expenses
 * 
 * WHY MERGE IS NECESSARY:
 * - App expenses may not all be in vector store
 * - add_to_pdf contains app-only expenses
 * - Need complete picture for reconciliation proof
 * - Users need single source of truth document
 * 
 * PROCESS:
 * 1. Fetch all current app expenses via MCP tool
 * 2. Merge with add_to_pdf expenses (if any)
 * 3. Deduplicate based on ID
 * 4. Generate synced report in CSV + HTML
 * 5. Save with "synced" prefix for clarity
 * 
 * @param {string} authToken - JWT token for authentication
 * @param {number} userId - User ID for expense filtering
 * @param {Array} addToPdfExpenses - Expenses from add_to_pdf list (optional)
 * @returns {Promise<Object>} Report metadata with file paths
 */
export const generateSyncedExpenseReport = async (authToken, userId, addToPdfExpenses = []) => {
  console.log(`[PDF Generator] Generating SYNCED expense report for user ${userId}`);
  console.log(`[PDF Generator] add_to_pdf expenses: ${addToPdfExpenses.length}`);
  
  await ensureReportsDir();
  
  try {
    // Step 1: Fetch all current app expenses via MCP tool
    // listExpensesTool now returns: { expenses: [...], total: N, showing: N }
    const listResult = await listExpensesTool.run({ limit: 1000 }, authToken);
    
    console.log('[PDF Generator] List result:', {
      hasExpenses: !!listResult?.expenses,
      expensesIsArray: Array.isArray(listResult?.expenses),
      expensesLength: listResult?.expenses?.length || 0,
      total: listResult?.total
    });
    
    // Extract expenses array from structured response
    const appExpenses = listResult?.expenses || [];
    
    if (!Array.isArray(appExpenses)) {
      console.warn('[PDF Generator] No app expenses returned or invalid format', { 
        listResultType: typeof listResult,
        listResult 
      });
      return {
        success: false,
        error: 'Failed to fetch app expenses',
        reportType: 'SYNCED'
      };
    }
    
    console.log(`[PDF Generator] Fetched ${appExpenses.length} app expenses`);
    
    // Step 2: Merge app expenses with add_to_pdf expenses
    // add_to_pdf contains app-only expenses that weren't in PDF
    const mergedExpenses = [...appExpenses];
    
    // Add expenses from add_to_pdf that aren't already in app
    for (const action of addToPdfExpenses) {
      const expense = action.expense;
      // Check if already exists (by ID)
      const exists = appExpenses.some(e => e.id && expense.id && e.id === expense.id);
      if (!exists) {
        mergedExpenses.push(expense);
      }
    }
    
    console.log(`[PDF Generator] Merged total: ${mergedExpenses.length} expenses`);
    
    if (mergedExpenses.length === 0) {
      console.warn('[PDF Generator] No expenses to include in synced report');
      return {
        success: false,
        error: 'No expenses available for synced report'
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
    
    // Step 4: Generate reports in multiple formats
    const csvContent = generateCSV(mergedExpenses, metadata);
    const htmlContent = generateHTML(mergedExpenses, metadata);
    
    // Step 5: Save to disk with "synced" prefix
    const timestamp = Date.now();
    const csvFilename = `synced_expense_report_${userId}_${timestamp}.csv`;
    const htmlFilename = `synced_expense_report_${userId}_${timestamp}.html`;
    
    const csvPath = path.join(REPORTS_DIR, csvFilename);
    const htmlPath = path.join(REPORTS_DIR, htmlFilename);
    
    await fs.writeFile(csvPath, csvContent, 'utf-8');
    await fs.writeFile(htmlPath, htmlContent, 'utf-8');
    
    console.log(`[PDF Generator] ✓ SYNCED report generated successfully`);
    console.log(`[PDF Generator]   CSV: ${csvPath}`);
    console.log(`[PDF Generator]   HTML: ${htmlPath}`);
    
    // Step 6: Return metadata
    return {
      success: true,
      reportId: metadata.reportId,
      reportType: 'SYNCED',
      files: {
        csv: {
          path: csvPath,
          filename: csvFilename,
          url: `/reports/${csvFilename}` // For download endpoint
        },
        html: {
          path: htmlPath,
          filename: htmlFilename,
          url: `/reports/${htmlFilename}` // For download endpoint
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
    console.error('[PDF Generator] Error generating synced report:', error.message);
    throw new Error(`Failed to generate synced expense report: ${error.message}`);
  }
};

/**
 * Fetches app expenses and generates report
 * 
 * THIS IS THE MAIN REPORT GENERATION FUNCTION (Original, kept for backward compatibility)
 * 
 * PROCESS:
 * 1. Fetch latest expenses via MCP listExpenses tool
 * 2. Calculate summary statistics
 * 3. Generate both CSV and HTML formats
 * 4. Save to disk
 * 5. Return file paths
 * 
 * WHY MULTIPLE FORMATS:
 * - CSV: Machine-readable, import to Excel
 * - HTML: Human-readable, print to PDF
 * - Flexibility for different use cases
 * 
 * @param {string} authToken - JWT token for authentication
 * @param {number} userId - User ID for expense filtering
 * @param {Object} options - Generation options
 * @returns {Promise<Object>} Report metadata with file paths
 */
export const generateExpenseReport = async (authToken, userId, options = {}) => {
  console.log(`[PDF Generator] Generating expense report for user ${userId}`);
  
  await ensureReportsDir();
  
  try {
    // Step 1: Fetch expenses via MCP tool (enforces auth and filtering)
    // listExpensesTool now returns: { expenses: [...], total: N, showing: N }
    const listResult = await listExpensesTool.run({ limit: 1000 }, authToken);
    
    // Extract expenses array from structured response
    const expenses = listResult?.expenses || [];
    
    if (!Array.isArray(expenses) || expenses.length === 0) {
      console.warn('[PDF Generator] No expenses found to generate report', {
        hasListResult: !!listResult,
        expensesLength: expenses?.length || 0
      });
      return {
        success: false,
        error: 'No expenses available to generate report',
        reportType: 'STANDARD'
      };
    }
    
    console.log(`[PDF Generator] Fetched ${expenses.length} expenses`);
    
    // Step 2: Calculate summary
    const totalAmount = expenses.reduce((sum, exp) => sum + parseFloat(exp.amount || 0), 0);
    
    const metadata = {
      generatedAt: new Date().toISOString(),
      userId,
      totalExpenses: expenses.length,
      totalAmount,
      reportId: `report_${Date.now()}`
    };
    
    // Step 3: Generate reports in multiple formats
    const csvContent = generateCSV(expenses, metadata);
    const htmlContent = generateHTML(expenses, metadata);
    
    // Step 4: Save to disk
    const timestamp = Date.now();
    const csvFilename = `expense_report_${userId}_${timestamp}.csv`;
    const htmlFilename = `expense_report_${userId}_${timestamp}.html`;
    
    const csvPath = path.join(REPORTS_DIR, csvFilename);
    const htmlPath = path.join(REPORTS_DIR, htmlFilename);
    
    await fs.writeFile(csvPath, csvContent, 'utf-8');
    await fs.writeFile(htmlPath, htmlContent, 'utf-8');
    
    console.log(`[PDF Generator] ✓ Report generated successfully`);
    console.log(`[PDF Generator]   CSV: ${csvPath}`);
    console.log(`[PDF Generator]   HTML: ${htmlPath}`);
    
    // Step 5: Return metadata
    return {
      success: true,
      reportId: metadata.reportId,
      files: {
        csv: {
          path: csvPath,
          filename: csvFilename,
          url: `/reports/${csvFilename}` // For download endpoint
        },
        html: {
          path: htmlPath,
          filename: htmlFilename,
          url: `/reports/${htmlFilename}` // For download endpoint
        }
      },
      metadata: {
        totalExpenses: expenses.length,
        totalAmount: formatCurrency(totalAmount),
        generatedAt: metadata.generatedAt
      }
    };
  } catch (error) {
    console.error('[PDF Generator] Error generating report:', error.message);
    throw new Error(`Failed to generate expense report: ${error.message}`);
  }
};

/**
 * Generates a report summary message
 * 
 * @param {Object} reportResult - Result from generateExpenseReport
 * @returns {string} Human-readable summary
 */
export const summarizeReport = (reportResult) => {
  if (!reportResult.success) {
    return `Failed to generate report: ${reportResult.error}`;
  }
  
  const lines = [];
  lines.push('=== EXPENSE REPORT GENERATED ===');
  lines.push('');
  lines.push(`Report ID: ${reportResult.reportId}`);
  lines.push(`Total Expenses: ${reportResult.metadata.totalExpenses}`);
  lines.push(`Total Amount: ${reportResult.metadata.totalAmount}`);
  lines.push(`Generated: ${reportResult.metadata.generatedAt}`);
  lines.push('');
  lines.push('DOWNLOAD OPTIONS:');
  lines.push(`  📊 CSV: ${reportResult.files.csv.filename}`);
  lines.push(`  📄 HTML: ${reportResult.files.html.filename} (Print to PDF)`);
  lines.push('');
  lines.push('Tip: Open the HTML file in your browser and use Print → Save as PDF');
  
  return lines.join('\n');
};
