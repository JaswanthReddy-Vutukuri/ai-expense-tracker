import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatSortModule, MatSort, Sort } from '@angular/material/sort';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatCardModule } from '@angular/material/card';
import { Expense } from '../../models/expense.model';
import { ExpenseService } from '../../services/expense.service';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-expense-list',
  standalone: true,
  imports: [
    CommonModule, 
    RouterLink, 
    MatTableModule, 
    MatPaginatorModule, 
    MatSortModule,
    MatButtonModule, 
    MatIconModule,
    MatDialogModule,
    MatCardModule
  ],
  template: `
    <div class="list-container">
      <div class="header-row">
        <h1>Expenses</h1>
        <button mat-raised-button color="primary" routerLink="new">
          <mat-icon>add</mat-icon> New Expense
        </button>
      </div>

      <mat-card>
        <table mat-table [dataSource]="expenses" matSort (matSortChange)="handleSortChange($event)">
          <ng-container matColumnDef="date">
            <th mat-header-cell *matHeaderCellDef mat-sort-header="date"> Date </th>
            <td mat-cell *matCellDef="let element"> {{element.date | date}} </td>
          </ng-container>

          <ng-container matColumnDef="title">
            <th mat-header-cell *matHeaderCellDef> Description </th>
            <td mat-cell *matCellDef="let element"> {{element.description}} </td>
          </ng-container>

          <ng-container matColumnDef="category">
            <th mat-header-cell *matHeaderCellDef> Category </th>
            <td mat-cell *matCellDef="let element"> {{element.category_name}} </td>
          </ng-container>

          <ng-container matColumnDef="amount">
            <th mat-header-cell *matHeaderCellDef> Amount </th>
            <td mat-cell *matCellDef="let element"> {{element.amount | currency}} </td>
          </ng-container>

          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef> Actions </th>
            <td mat-cell *matCellDef="let element">
              <button mat-icon-button color="primary" [routerLink]="['edit', element.id]">
                <mat-icon>edit</mat-icon>
              </button>
              <button mat-icon-button color="warn" (click)="deleteExpense(element)">
                <mat-icon>delete</mat-icon>
              </button>
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
          <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
        </table>

        <mat-paginator 
          [length]="total"
          [pageSize]="pageSize"
          [pageSizeOptions]="[5, 10, 25]"
          (page)="handlePageEvent($event)">
        </mat-paginator>
      </mat-card>
    </div>
  `,
  styles: [`
    .list-container { max-width: 1200px; margin: 0 auto; }
    .header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
    table { width: 100%; }
    mat-card { padding: 0; overflow: hidden; }
  `]
})
export class ExpenseListComponent implements OnInit {
  expenses: Expense[] = [];
  displayedColumns: string[] = ['date', 'title', 'category', 'amount', 'actions'];
  total = 0;
  pageSize = 10;
  pageIndex = 0;
  sortBy = 'date';
  sortOrder: 'asc' | 'desc' = 'desc';

  constructor(private expenseService: ExpenseService, private dialog: MatDialog) {}

  ngOnInit() {
    this.loadExpenses();
  }

  loadExpenses() {
    this.expenseService.getExpenses(this.pageIndex, this.pageSize, this.sortBy, this.sortOrder).subscribe(response => {
      this.expenses = response.data;
      this.total = response.total;
    });
  }

  handlePageEvent(e: PageEvent) {
    this.pageIndex = e.pageIndex;
    this.pageSize = e.pageSize;
    this.loadExpenses();
  }

  handleSortChange(sort: Sort) {
    this.sortBy = sort.active || 'date';
    this.sortOrder = sort.direction || 'desc';
    this.pageIndex = 0; // Reset to first page on sort
    this.loadExpenses();
  }

  deleteExpense(expense: Expense) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: { title: 'Delete Expense', message: `Are you sure you want to delete "${expense.description}"?` }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && expense.id) {
        this.expenseService.deleteExpense(expense.id).subscribe(() => {
          this.loadExpenses();
        });
      }
    });
  }
}
