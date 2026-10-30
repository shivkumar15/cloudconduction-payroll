import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || (import.meta.env.PROD ? "/api" : "http://localhost:5001/api"),
  withCredentials: true,
  headers: {
    "Content-Type": "application/json"
  },
  timeout: 10_000
});

export default api;
