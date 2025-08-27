/**
 * This file contains the TypeScript type definitions for the server template JSON format.
 * These interfaces are used to ensure type safety when reading and processing the template.
 */

export interface TemplateRoleOverwrite {
  role: string; // Role name, e.g., "@everyone" or "実行委員"
  allow: string[]; // Array of permission flags, e.g., "SEND_MESSAGES"
  deny: string[];
}

export interface TemplateChannel {
  name: string;
  type: 'text' | 'voice' | 'forum'; // As per design doc
  topic?: string;
  bitrate?: number;
  overwrites?: TemplateRoleOverwrite[];
}

export interface TemplateCategory {
  name: string;
  channels: TemplateChannel[];
}

export interface TemplateRole {
  name: string;
  color?: string; // Hex string like "#3498DB"
  hoist?: boolean;
  mentionable?: boolean;
}

export interface ServerTemplate {
  version: string;
  name:string;
  roles?: TemplateRole[];
  categories?: TemplateCategory[];
}
