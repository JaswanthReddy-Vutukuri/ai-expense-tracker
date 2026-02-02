import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { MatSnackBar } from '@angular/material/snack-bar';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const snackBar = inject(MatSnackBar);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      let errorMessage = 'An unknown error occurred!';
      
      if (error.status === 401) {
        authService.logout();
        errorMessage = 'Session expired. Please login again.';
      } else if (error.error?.message) {
        errorMessage = error.error.message;
      }

      snackBar.open(errorMessage, 'Close', { duration: 5000 });
      return throwError(() => error);
    })
  );
};
