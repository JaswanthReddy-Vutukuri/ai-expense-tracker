import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { ExpenseService } from '../../services/expense.service';

@Component({
  selector: 'app-expense-form',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterLink,
    MatCardModule, MatFormFieldModule, MatInputModule, 
    MatSelectModule, MatButtonModule, MatDatepickerModule, MatNativeDateModule
  ],
  template: `
    <div class="form-container">
      <mat-card>
        <mat-card-header>
          <mat-card-title>{{ isEdit ? 'Edit' : 'New' }} Expense</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <form [formGroup]="expenseForm" (ngSubmit)="onSubmit()">
            <div class="form-grid">
              <mat-form-field appearance="outline">
                <mat-label>Title</mat-label>
                <input matInput formControlName="title">
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Amount</mat-label>
                <input matInput type="number" formControlName="amount">
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Category</mat-label>
                <mat-select formControlName="category">
                  <mat-option *ngFor="let cat of categories" [value]="cat.id">{{cat.name}}</mat-option>
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Date</mat-label>
                <input matInput [matDatepicker]="picker" formControlName="date">
                <mat-datepicker-toggle matIconSuffix [for]="picker"></mat-datepicker-toggle>
                <mat-datepicker #picker></mat-datepicker>
              </mat-form-field>
            </div>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Description (Optional)</mat-label>
              <textarea matInput formControlName="description" rows="3"></textarea>
            </mat-form-field>

            <div class="form-actions">
              <button mat-button type="button" routerLink="/expenses">Cancel</button>
              <button mat-raised-button color="primary" type="submit" [disabled]="expenseForm.invalid || loading">
                {{ loading ? 'Saving...' : 'Save Expense' }}
              </button>
            </div>
          </form>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .form-container { max-width: 800px; margin: 0 auto; }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 16px; }
    .full-width { width: 100%; }
    .form-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px; }
    @media (max-width: 600px) { .form-grid { grid-template-columns: 1fr; } }
  `]
})
export class ExpenseFormComponent implements OnInit {
  expenseForm: FormGroup;
  isEdit = false;
  id?: number;
  loading = false;
  categories: {id: number, name: string}[] = [];

  constructor(
    private fb: FormBuilder,
    private expenseService: ExpenseService,
    private router: Router,
    private route: ActivatedRoute
  ) {
    this.expenseForm = this.fb.group({
      title: ['', Validators.required],
      amount: [null, [Validators.required, Validators.min(0.01)]],
      category: ['', Validators.required],
      date: [new Date(), Validators.required],
      description: ['']
    });
  }

  ngOnInit() {
    // Load categories
    this.expenseService.getCategories().subscribe(categories => {
      this.categories = categories;
    });

    const idParam = this.route.snapshot.params['id'];
    if (idParam) {
      this.id = +idParam;
      this.isEdit = true;
      this.expenseService.getExpenseById(this.id).subscribe(expense => {
        this.expenseForm.patchValue({
          title: expense.description,
          amount: expense.amount,
          category: expense.category_id,
          date: new Date(expense.date),
          description: expense.description
        });
      });
    }
  }

  onSubmit() {
    if (this.expenseForm.valid) {
      this.loading = true;
      const formValue = this.expenseForm.value;
      
      // Transform to API format
      const apiPayload = {
        amount: formValue.amount,
        category_id: formValue.category,
        description: formValue.title + (formValue.description ? ': ' + formValue.description : ''),
        date: this.formatDate(formValue.date)
      };
      
      const obs = this.isEdit && this.id
        ? this.expenseService.updateExpense(this.id, apiPayload as any)
        : this.expenseService.createExpense(apiPayload as any);

      obs.subscribe({
        next: () => this.router.navigate(['/expenses']),
        error: () => this.loading = false
      });
    }
  }
  
  private formatDate(date: Date): string {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
