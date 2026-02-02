import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Expense, ExpenseSummary } from '../models/expense.model';

@Injectable({
  providedIn: 'root'
})
export class ExpenseService {
  private apiUrl = `${environment.apiUrl}`;

  constructor(private http: HttpClient) {}

  getExpenses(page = 0, limit = 10): Observable<Expense[]> {
    const params = new HttpParams()
      .set('page', (page + 1).toString())
      .set('limit', limit.toString());
    return this.http.get<Expense[]>(`${this.apiUrl}/expenses`, { params });
  }

  getExpenseById(id: number): Observable<Expense> {
    return this.http.get<Expense>(`${this.apiUrl}/expenses/${id}`);
  }

  createExpense(expense: Expense): Observable<Expense> {
    return this.http.post<Expense>(`${this.apiUrl}/expenses`, expense);
  }

  updateExpense(id: number, expense: Expense): Observable<Expense> {
    return this.http.put<Expense>(`${this.apiUrl}/expenses/${id}`, expense);
  }

  deleteExpense(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/expenses/${id}`);
  }

  getSummary(): Observable<ExpenseSummary> {
    return this.http.get<ExpenseSummary>(`${this.apiUrl}/dashboard/summary`);
  }

  getCategories(): Observable<{id: number, name: string}[]> {
    return this.http.get<{id: number, name: string}[]>(`${this.apiUrl}/expenses/categories`);
  }
}
