export interface MCPToolParameter {
  type: 'string' | 'number' | 'boolean' | 'array';
  description: string;
  required?: boolean;
  default?: unknown;
}

export interface MCPSchema {
  name: string;
  description: string;
  parameters: Record<string, MCPToolParameter>;
}

export interface MCPResponse {
  ok: boolean;
  data?: unknown;
  error?: string;
}
