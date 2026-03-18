
import { ToolDefinition } from "../../types/index.js";
import { D365Connection } from "../../d365/connection.js";
import { parseToolArgs, parseToolResponse } from "../../utils/zod-validation.js";
import { handleError } from "../../utils/error-handler.js";
import { z } from "zod";

const createRecordArgsSchema = z.object({
  entityLogicalName: z.string(),
  firstname: z.string().optional(),
  lastname: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
}).strict();

const createRecordFromApiResponseSchema = z.object({
  success: z.boolean(),
  entityLogicalName: z.string(),
  recordId: z.string().optional(),
}).strict();

const createRecordTool: ToolDefinition = {
  name: "create_record",

  description:
    "Creates a Dynamics 365 record using structured input fields",

  inputSchema: {
    type: "object",
    properties: {
      entityLogicalName: { type: "string" },
      firstname: { type: "string" },
      lastname: { type: "string" },
      email: { type: "string" },
      phone: { type: "string" },
      address: { type: "string" },
    },
    required: ["entityLogicalName", "firstname", "email", "phone"],
  },

  handler: async (rawArgs: any, connection: D365Connection) => {
    try {
      const args = parseToolArgs(
        createRecordArgsSchema,
        rawArgs,
        "create_record"
      );

      const recordPayload: any = {
        firstname: args.firstname,
        lastname: args.lastname,
        emailaddress1: args.email,
        mobilephone: args.phone,
        address1_line1: args.address,
      };

      // remove undefined fields
      Object.keys(recordPayload).forEach(
        (key) => recordPayload[key] === undefined && delete recordPayload[key]
      );

      const response = await connection.post(
        `/${args.entityLogicalName}`,
        recordPayload
      );

      return parseToolResponse(
        createRecordFromApiResponseSchema,
        {
          success: true,
          entityLogicalName: args.entityLogicalName,
          recordId: response?.id || undefined,
        },
        "create_record"
      );
    } catch (error) {
      return handleError(error);
    }
  },
};

export function registerApiTools(): ToolDefinition[] {
  return [createRecordTool];
}