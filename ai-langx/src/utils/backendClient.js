/**
 * BACKEND CLIENT UTILITY
 * 
 * PURPOSE:
 * - Axios client for backend API calls
 * - Authentication token injection
 * - Error handling
 * 
 * Used by reconciliation graph and other handlers
 */

import axios from 'axios';

const BACKEND_BASE_URL = process.env.BACKEND_URL || 'http://localhost:3000';

/**
 * Create backend API client with authentication
 * 
 * @param {string} authToken - JWT token
 * @returns {Object} Axios instance
 */
export const createBackendClient = (authToken) => {
  return axios.create({
    baseURL: BACKEND_BASE_URL,
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    },
    timeout: 10000  // 10 second timeout
  });
};

/**
 * Make authenticated request to backend
 * 
 * @param {string} method - HTTP method
 * @param {string} path - API path
 * @param {string} authToken - JWT token
 * @param {Object} data - Request body
 * @returns {Promise<Object>} Response data
 */
export const makeBackendRequest = async (method, path, authToken, data = null) => {
  try {
    const client = createBackendClient(authToken);
    
    const config = {
      method,
      url: path
    };
    
    if (data) {
      config.data = data;
    }
    
    const response = await client.request(config);
    return response.data;
    
  } catch (error) {
    console.error('[Backend Client] Request error:', error.message);
    
    if (error.response) {
      // Server responded with error
      throw new Error(`Backend error (${error.response.status}): ${error.response.data?.message || error.message}`);
    } else if (error.request) {
      // No response received
      throw new Error('Backend not responding');
    } else {
      // Request setup error
      throw new Error(`Request error: ${error.message}`);
    }
  }
};

/**
 * Backend client object with REST methods (compatible with ai/ implementation)
 * Used by categoryCache and other utilities that need backend access
 */
export const backendClient = {
  get: async (url, params = {}, token) => {
    console.log('[BackendClient] GET request', { 
      url, 
      params,
      hasToken: !!token,
      baseURL: `${BACKEND_BASE_URL}/api${url}`
    });
    
    const client = createBackendClient(token);
    try {
      const response = await client.get(`/api${url}`, { params });
      console.log('[BackendClient] GET response', { 
        url, 
        status: response.status 
      });
      return response.data;
    } catch (error) {
      console.error('[BackendClient] GET failed', { 
        url, 
        params,
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      throw error;
    }
  },
  
  post: async (url, data, token) => {
    console.log('[BackendClient] POST request', { 
      url, 
      data, 
      hasToken: !!token,
      baseURL: `${BACKEND_BASE_URL}/api${url}`
    });
    
    const client = createBackendClient(token);
    try {
      const response = await client.post(`/api${url}`, data);
      console.log('[BackendClient] POST response', { 
        url, 
        status: response.status 
      });
      return response.data;
    } catch (error) {
      console.error('[BackendClient] POST failed', { 
        url, 
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      throw error;
    }
  },
  
  put: async (url, data, token) => {
    console.log('[BackendClient] PUT request', { 
      url, 
      data,
      hasToken: !!token,
      baseURL: `${BACKEND_BASE_URL}/api${url}`
    });
    
    const client = createBackendClient(token);
    try {
      const response = await client.put(`/api${url}`, data);
      console.log('[BackendClient] PUT response', { 
        url, 
        status: response.status 
      });
      return response.data;
    } catch (error) {
      console.error('[BackendClient] PUT failed', { 
        url, 
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      throw error;
    }
  },
  
  delete: async (url, token) => {
    console.log('[BackendClient] DELETE request', { 
      url,
      hasToken: !!token,
      baseURL: `${BACKEND_BASE_URL}/api${url}`
    });
    
    const client = createBackendClient(token);
    try {
      const response = await client.delete(`/api${url}`);
      console.log('[BackendClient] DELETE response', { 
        url, 
        status: response.status 
      });
      return response.data;
    } catch (error) {
      console.error('[BackendClient] DELETE failed', { 
        url,
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      throw error;
    }
  }
};
