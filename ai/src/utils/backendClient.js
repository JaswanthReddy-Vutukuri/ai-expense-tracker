import axios from 'axios';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';
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
    const client = createClient(token);
    const response = await client.post(url, data);
    return response.data;
  },
  get: async (url, params, token) => {
    const client = createClient(token);
    const response = await client.get(url, { params });
    return response.data;
  },
  put: async (url, data, token) => {
    const client = createClient(token);
    const response = await client.put(url, data);
    return response.data;
  },
  delete: async (url, token) => {
    const client = createClient(token);
    const response = await client.delete(url);
    return response.data;
  }
};
