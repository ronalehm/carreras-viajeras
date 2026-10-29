import axios from "axios";

// Single HTTP client for browser calls to this app's own Route Handlers (same origin).
export const api = axios.create({ baseURL: "/api", timeout: 10_000 });
