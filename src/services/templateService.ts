import * as fs from 'fs/promises';
import { ZodError, ZodIssue } from 'zod';
import { ServerTemplate, ServerTemplateSchema } from '../schemas/templateSchema';

class TemplateValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'TemplateValidationError';
    }
}

/**
 * Reads a template file from disk, parses it as JSON, and validates it against the ServerTemplateSchema.
 * @param filePath The absolute path to the template file.
 * @returns A promise that resolves to the validated ServerTemplate object.
 * @throws {TemplateValidationError} If the file is not found, is invalid JSON, or fails schema validation.
 */
export async function loadAndValidateTemplate(filePath: string): Promise<ServerTemplate> {
    let fileContent: string;
    try {
        fileContent = await fs.readFile(filePath, 'utf-8');
    } catch (error) {
        throw new TemplateValidationError(`Template file not found at path: ${filePath}`);
    }

    let jsonData: unknown;
    try {
        jsonData = JSON.parse(fileContent);
    } catch (error) {
        throw new TemplateValidationError('Template file is not valid JSON.');
    }

    const validationResult = ServerTemplateSchema.safeParse(jsonData);

    if (!validationResult.success) {
        const issues: ZodIssue[] = (validationResult.error as ZodError).issues ?? [];
        const errorMessages = issues.map((issue) => {
            const path = (issue.path?.join?.('.') ?? '.') as string;
            return ` - at path \`${path}\`: ${issue.message}`;
        });
        throw new TemplateValidationError(`Template validation failed:\n${errorMessages.join('\n')}`);
    }

    return validationResult.data;
}
