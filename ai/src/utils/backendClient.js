import axios from 'axios';

const BACKEND_URL = process.env.BACKEND_BASE_URL || 'http://localhost:3000';
const API_PREFIX = '/api'; // Backend routes are mounted under /api

/**
 * Creates a configured axios instance for backend communication.
 * The token is passed dynamically to forward user authentication.
 */
const createClient = (token) => {
  return axios.create({
    baseURL: BACKEND_URL + API_PREFIX,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    timeout: 10000 // 10 second timeout for backend calls
  });
};

export const backendClient = {
  post: async (url, data, token) => {
    console.log('[BackendClient] POST request', { 
      url, 
      data, 
      hasToken: !!token,
      baseURL: BACKEND_URL + API_PREFIX + url
    });
    
    const client = createClient(token);
    try {
      const response = await client.post(url, data);
      console.log('[BackendClient] POST response', { url, status: response.status, data: response.data });
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
  get: async (url, params, token) => {
    console.log('[BackendClient] GET request', { 
      url, 
      params,
      hasToken: !!token,
      baseURL: BACKEND_URL + API_PREFIX + url
    });
    
    const client = createClient(token);
    try {
      const response = await client.get(url, { params });
      console.log('[BackendClient] GET response', { url, status: response.status, dataPreview: JSON.stringify(response.data).substring(0, 200) });
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
  
  put: async (url, data, token) => {
    console.log('[BackendClient] PUT request', { 
      url, 
      data,
      hasToken: !!token,
      baseURL: BACKEND_URL + API_PREFIX + url
    });
    
    const client = createClient(token);
    try {
      const response = await client.put(url, data);
      console.log('[BackendClient] PUT response', { url, status: response.status, data: response.data });
      return response.data;
    } catch (error) {
      console.error('[BackendClient] PUT failed', { 
        url, 
        data,
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
      baseURL: BACKEND_URL + API_PREFIX + url
    });
    
    const client = createClient(token);
    try {
      const response = await client.delete(url);
      console.log('[BackendClient] DELETE response', { url, status: response.status, data: response.data });
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
