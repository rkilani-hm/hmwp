/**
 * Utility for parsing edge function errors into user-friendly messages.
 * This provides consistent error messaging across all edge function calls.
 */

export interface EdgeFunctionError {
  message?: string;
  status?: number;
  name?: string;
}

export interface EdgeFunctionData {
  error?: string;
  retryAfter?: number;
  message?: string;
}

/**
 * Parse edge function error into a user-friendly message
 */
export function parseEdgeFunctionError(error: EdgeFunctionError | null, data: EdgeFunctionData | null): string {
  // Check if data contains an error message from the edge function
  if (data?.error) {
    return data.error;
  }
  
  // Handle specific error patterns
  const errorMessage = error?.message || '';
  
  // Password-related errors
  if (errorMessage.toLowerCase().includes('password') || 
      errorMessage.toLowerCase().includes('invalid password')) {
    return 'Incorrect password. Please enter your correct password to confirm this action.';
  }
  
  // Rate limiting errors (429)
  if (errorMessage.includes('429') || errorMessage.toLowerCase().includes('too many')) {
    const retryAfter = data?.retryAfter;
    if (retryAfter) {
      const minutes = Math.ceil(retryAfter / 60);
      return `Too many failed attempts. Please wait ${minutes} minute${minutes > 1 ? 's' : ''} before trying again.`;
    }
    return 'Too many attempts. Please wait a few minutes before trying again.';
  }
  
  // Authentication errors (401)
  if (errorMessage.includes('401') || 
      errorMessage.toLowerCase().includes('unauthorized') ||
      errorMessage.toLowerCase().includes('authentication failed') ||
      errorMessage.toLowerCase().includes('no authorization')) {
    return 'Your session has expired. Please log in again to continue.';
  }
  
  // Forbidden errors (403)
  if (errorMessage.includes('403') || errorMessage.toLowerCase().includes('forbidden')) {
    return 'You do not have permission to perform this action.';
  }
  
  // Not found errors (404)
  if (errorMessage.includes('404') || errorMessage.toLowerCase().includes('not found')) {
    return 'The requested resource could not be found.';
  }
  
  // Network errors
  if (errorMessage.toLowerCase().includes('network') || 
      errorMessage.toLowerCase().includes('fetch') ||
      errorMessage.toLowerCase().includes('failed to fetch') ||
      errorMessage.toLowerCase().includes('connection')) {
    return 'Unable to connect to the server. Please check your internet connection and try again.';
  }
  
  // Edge function non-2xx status code errors
  if (errorMessage.includes('non-2xx') || errorMessage.includes('status code')) {
    // Try to extract the actual error from data
    if (data?.error) {
      return data.error;
    }
    return 'The server encountered an issue processing your request. Please try again.';
  }
  
  // Validation errors
  if (errorMessage.toLowerCase().includes('validation')) {
    return errorMessage;
  }
  
  // Server errors (500)
  if (errorMessage.includes('500') || errorMessage.toLowerCase().includes('internal server')) {
    return 'An unexpected server error occurred. Please try again later or contact support.';
  }
  
  // Timeout errors
  if (errorMessage.toLowerCase().includes('timeout') || errorMessage.toLowerCase().includes('timed out')) {
    return 'The request took too long to complete. Please try again.';
  }
  
  // Default fallback - return the original message if it exists, otherwise generic message
  return errorMessage || 'An unexpected error occurred. Please try again or contact support if the issue persists.';
}

/**
 * Get error message categorization for UI styling
 */
export type ErrorCategory = 'auth' | 'validation' | 'network' | 'server' | 'permission' | 'general';

export function getErrorCategory(error: EdgeFunctionError | null, data: EdgeFunctionData | null): ErrorCategory {
  const errorMessage = error?.message?.toLowerCase() || '';
  const dataError = data?.error?.toLowerCase() || '';
  const combined = `${errorMessage} ${dataError}`;
  
  if (combined.includes('password') || combined.includes('unauthorized') || 
      combined.includes('401') || combined.includes('session')) {
    return 'auth';
  }
  
  if (combined.includes('validation') || combined.includes('invalid') ||
      combined.includes('required')) {
    return 'validation';
  }
  
  if (combined.includes('network') || combined.includes('fetch') ||
      combined.includes('connection') || combined.includes('timeout')) {
    return 'network';
  }
  
  if (combined.includes('forbidden') || combined.includes('403') ||
      combined.includes('permission')) {
    return 'permission';
  }
  
  if (combined.includes('500') || combined.includes('server')) {
    return 'server';
  }
  
  return 'general';
}
