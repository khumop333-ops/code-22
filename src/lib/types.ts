export type ChatRole = "user" | "assistant" | "system";

export interface Conversation {
  id: string;
  title: string;
  system_prompt: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: ChatRole;
  content: string;
  created_at: string;
}

export interface EndpointOverrides {
  baseUrl?: string;
  modelId?: string;
  apiKey?: string;
}
