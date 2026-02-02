import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatGridListModule } from '@angular/material/grid-list';
import { NgChartsModule } from 'ng2-charts';
import { Chart, ChartConfiguration, ChartData, ChartType, registerables } from 'chart.js';
import { ExpenseService } from '../services/expense.service';
import { ExpenseSummary } from '../models/expense.model';

// Register Chart.js components
Chart.register(...registerables);

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatGridListModule, NgChartsModule],
  template: `
    <div class="dashboard-container">
      <h1>Financial Overview</h1>
      
      <div class="stats-grid">
        <mat-card class="stat-card">
          <mat-card-header>
            <mat-card-subtitle>Total Expenses</mat-card-subtitle>
            <mat-card-title>{{ summary?.total_spent | currency }}</mat-card-title>
          </mat-card-header>
        </mat-card>

        <mat-card class="stat-card">
          <mat-card-header>
            <mat-card-subtitle>This Month</mat-card-subtitle>
            <mat-card-title>{{ summary?.month_spent | currency }}</mat-card-title>
          </mat-card-header>
        </mat-card>
      </div>

      <div class="chart-container" *ngIf="summary">
        <mat-card>
          <mat-card-header><mat-card-title>Spending by Category</mat-card-title></mat-card-header>
          <mat-card-content>
            <div style="display: block; position: relative; height:400px; width:400px; margin: 0 auto;">
              <canvas baseChart
                [data]="pieChartData"
                [options]="pieChartOptions"
                [type]="pieChartType">
              </canvas>
            </div>
          </mat-card-content>
        </mat-card>
      </div>
    </div>
  `,
  styles: [`
    .dashboard-container { max-width: 1200px; margin: 0 auto; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px; }
    .stat-card { background: #3f51b5; color: white; padding: 16px; }
    .stat-card mat-card-subtitle { color: rgba(255,255,255,0.8); }
    .chart-container { max-width: 600px; margin: 0 auto; }
  `]
})
export class DashboardComponent implements OnInit {
  summary?: ExpenseSummary;

  public pieChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: { 
        display: true, 
        position: 'right',
        labels: {
          generateLabels: (chart) => {
            const data = chart.data;
            if (data.labels && data.datasets.length) {
              return data.labels.map((label, i) => {
                const value = data.datasets[0].data[i] as number;
                const total = (data.datasets[0].data as number[]).reduce((a, b) => a + b, 0);
                const percentage = ((value / total) * 100).toFixed(1);
                return {
                  text: `${label}: $${value.toFixed(2)} (${percentage}%)`,
                  fillStyle: (data.datasets[0].backgroundColor as string[])[i],
                  hidden: false,
                  index: i
                };
              });
            }
            return [];
          }
        }
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const label = context.label || '';
            const value = context.parsed as number;
            const dataset = context.dataset.data as number[];
            const total = dataset.reduce((a, b) => a + b, 0);
            const percentage = ((value / total) * 100).toFixed(1);
            return `${label}: $${value.toFixed(2)} (${percentage}%)`;
          }
        }
      }
    }
  };
  public pieChartData: ChartData<'pie', number[], string | string[]> = {
    labels: [],
    datasets: [{ data: [] }]
  };
  public pieChartType: ChartType = 'pie';

  constructor(private expenseService: ExpenseService) {}

  ngOnInit() {
    this.expenseService.getSummary().subscribe({
      next: (summary) => {
        this.summary = summary;
        if (summary?.category_breakdown && summary.category_breakdown.length > 0) {
          this.pieChartData = {
            labels: summary.category_breakdown.map(c => c.name),
            datasets: [{
              data: summary.category_breakdown.map(c => c.total),
              backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#C9CBCF']
            }]
          };
        }
      },
      error: (err) => {
        console.error('Error loading summary:', err);
        // Initialize with empty data
        this.summary = { total_spent: 0, month_spent: 0, category_breakdown: [] };
      }
    });
  }
}
