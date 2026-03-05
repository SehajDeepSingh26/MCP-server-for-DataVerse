/**
 * Type definitions for the MCP D365 Toolkit
 */

/**
 * D365 connection configuration
 */
export interface D365Config {
  url: string;
  clientId: string;
  clientSecret: string;
  tenantId: string;
}

/**
 * Plugin execution stage
 */
export enum PluginStage {
  PreValidation = 10,
  PreOperation = 20,
  PostOperation = 40,
}

/**
 * Plugin execution mode
 */
export enum PluginMode {
  Synchronous = 0,
  Asynchronous = 1,
}

/**
 * Plugin step information
 */
export interface PluginStep {
  id: string;
  name: string;
  pluginTypeName: string;
  entityName: string;
  message: string;
  stage: PluginStage;
  executionOrder: number;
  mode: PluginMode;
  filteringAttributes?: string[];
  images: PluginImage[];
  isEnabled: boolean;
}

/**
 * Plugin image information
 */
export interface PluginImage {
  id: string;
  name: string;
  imageType: "PreImage" | "PostImage" | "Both";
  attributes: string[];
}

/**
 * Entity metadata
 */
export interface EntityMetadata {
  logicalName: string;
  displayName: string;
  schemaName: string;
  objectTypeCode: number;
  primaryIdAttribute: string;
  primaryNameAttribute: string;
  attributes: AttributeMetadata[];
  oneToManyRelationships: RelationshipMetadata[];
  manyToOneRelationships: RelationshipMetadata[];
  manyToManyRelationships: RelationshipMetadata[];
}

/**
 * Attribute metadata
 */
export interface AttributeMetadata {
  logicalName: string;
  displayName: string;
  schemaName: string;
  attributeType: AttributeType;
  isPrimaryId: boolean;
  isPrimaryName: boolean;
  isCustomAttribute: boolean;
  isValidForCreate: boolean;
  isValidForUpdate: boolean;
  isValidForRead: boolean;
  requiredLevel: "None" | "SystemRequired" | "ApplicationRequired" | "Recommended";
  maxLength?: number;
  options?: OptionMetadata[];
  targets?: string[]; // For lookup attributes
}

/**
 * Attribute types
 */
export type AttributeType =
  | "String"
  | "Memo"
  | "Integer"
  | "Decimal"
  | "Double"
  | "Money"
  | "Boolean"
  | "DateTime"
  | "Lookup"
  | "Customer"
  | "Owner"
  | "Picklist"
  | "State"
  | "Status"
  | "Uniqueidentifier"
  | "Virtual"
  | "BigInt";

/**
 * Option set option metadata
 */
export interface OptionMetadata {
  value: number;
  label: string;
  color?: string;
}

/**
 * Relationship metadata
 */
export interface RelationshipMetadata {
  schemaName: string;
  referencedEntity: string;
  referencingEntity: string;
  referencedAttribute: string;
  referencingAttribute: string;
  relationshipType: "OneToMany" | "ManyToOne" | "ManyToMany";
  cascadeConfiguration?: CascadeConfiguration;
}

/**
 * Cascade configuration for relationships
 */
export interface CascadeConfiguration {
  assign: CascadeType;
  delete: CascadeType;
  merge: CascadeType;
  reparent: CascadeType;
  share: CascadeType;
  unshare: CascadeType;
}

/**
 * Cascade types
 */
export type CascadeType =
  | "NoCascade"
  | "Cascade"
  | "Active"
  | "UserOwned"
  | "RemoveLink"
  | "Restrict";

/**
 * Dependency information
 */
export interface Dependency {
  dependentComponentType: string;
  dependentComponentName: string;
  requiredComponentType: string;
  requiredComponentName: string;
  dependencyType: "Published" | "Unpublished" | "Solution";
}

/**
 * Tool definition
 */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
  handler: (args: any, connection: any) => Promise<any>;
}

/**
 * Error response
 */
export interface ErrorResponse {
  error: string;
  message: string;
  suggestion?: string;
  details?: any;
}
