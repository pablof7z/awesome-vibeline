// tenex_task.ts is executed by the tenex_task plugin.
// This script processes a transcript file, identifies the project name,
// and creates a detailed task for the project as a Nostr event.

import path from 'path';
import fs from 'node:fs/promises';

// @ts-ignore - Bun types
const { spawn, file, write } = Bun;

// Environment variables
const TENEX_PROJECTS_DIR = process.env.TENEX_PROJECTS_DIR || '<path-to-tenex-projects>';

// Check if the directory exists
(async () => {
  try {
    await fs.access(TENEX_PROJECTS_DIR);
  } catch (error) {
    console.error(`Error: Directory ${TENEX_PROJECTS_DIR} does not exist or is not accessible.`);
    console.error('Please set the TENEX_PROJECTS_DIR environment variable to a valid directory.');
    console.error('Example: export TENEX_PROJECTS_DIR=/path/to/tenex-projects');
    process.exit(1);
  }
})();

const FIND_PROJECT_MODEL = process.env.FIND_PROJECT_MODEL || 'llama3.2';
const TASK_MODEL = process.env.TASK_MODEL || 'qwen2.5';
const RELAYS = process.env.RELAYS || 'wss://relay.primal.net wss://relay.damus.io';

/**
 * Executes an Ollama query and returns the response
 * @param model The Ollama model to use
 * @param prompt The prompt to send to Ollama
 * @returns The response from Ollama
 */
async function queryOllama(model: string, prompt: string): Promise<string> {
  console.log(`Querying Ollama with model: ${model}`);
  
  // Create a temporary file for the prompt
  const tempPromptPath = path.join(process.cwd(), `temp_prompt_${Date.now()}.txt`);
  await fs.writeFile(tempPromptPath, prompt, 'utf-8');
  
  try {
    // Use cat to pipe the prompt into ollama
    const proc = spawn(['sh', '-c', `cat ${tempPromptPath} | ollama run ${model}`], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    
    const response = await new Response(proc.stdout).text();
    const error = await new Response(proc.stderr).text();
    
    if (error && error.trim()) {
      console.error(`Ollama error: ${error}`);
    }
    
    return response.trim();
  } finally {
    // Clean up the temporary file
    try {
      await fs.unlink(tempPromptPath);
    } catch (error) {
      console.warn(`Warning: Could not delete temporary prompt file: ${tempPromptPath}`);
    }
  }
}

/**
 * Gets a list of project directories in the TENEX_PROJECTS_DIR
 * @returns Array of project directory names
 */
async function getProjectDirectories(): Promise<string[]> {
  console.log(`Getting project directories from: ${TENEX_PROJECTS_DIR}`);
  
  try {
    const entries = await fs.readdir(TENEX_PROJECTS_DIR, { withFileTypes: true });
    const directories = entries
      .filter(entry => entry.isDirectory())
      .map(dir => dir.name);
    
    console.log(`Found ${directories.length} project directories`);
    return directories;
  } catch (error: any) {
    console.error(`Error reading project directories: ${error.message}`);
    return [];
  }
}

/**
 * Finds the project name from the transcript using Ollama
 * @param transcriptContent The content of the transcript file
 * @param projectDirs List of available project directories
 * @returns The identified project directory name
 */
async function findProjectName(transcriptContent: string, projectDirs: string[]): Promise<string> {
  console.log('Finding project name from transcript...');
  
  const prompt = `
You are tasked with identifying the name of a project mentioned in the following transcript.
The project name should match one of the directories in the list provided below.
Note that the directory names may have a random string suffix that is not part of the actual project name.
For example, the project "Shipyard" might be in a directory called "Shipyard-rux5kf".

Available project directories:
${projectDirs.join('\n')}

Transcript:
${transcriptContent}

Based on the transcript, which project directory is being referred to?
Respond with ONLY the exact directory name from the list above, nothing else.
`;

  const response = await queryOllama(FIND_PROJECT_MODEL, prompt);
  
  // Check if the response matches any of the project directories
  const matchedDir = projectDirs.find(dir => 
    dir === response || 
    dir.toLowerCase() === response.toLowerCase() ||
    dir.startsWith(response) ||
    response.startsWith(dir.split('-')[0])
  );
  
  if (matchedDir) {
    console.log(`Identified project directory: ${matchedDir}`);
    return matchedDir;
  } else {
    console.error(`Could not match response "${response}" to any project directory`);
    throw new Error('Could not identify project directory');
  }
}

/**
 * Reads the .tenex.json file from the project directory
 * @param projectDir The project directory name
 * @returns The parsed .tenex.json content
 */
async function readTenexConfig(projectDir: string): Promise<any> {
  const configPath = path.join(TENEX_PROJECTS_DIR, projectDir, '.tenex.json');
  console.log(`Reading Tenex config from: ${configPath}`);
  
  try {
    const configContent = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(configContent);
  } catch (error: any) {
    console.error(`Error reading Tenex config: ${error.message}`);
    throw new Error(`Could not read .tenex.json for project ${projectDir}`);
  }
}

/**
 * Reads a file if it exists, returns empty string otherwise
 * @param filePath Path to the file
 * @returns File content or empty string
 */
async function readFileIfExists(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    console.log(`File not found: ${filePath}`);
    return '';
  }
}

/**
 * Creates a detailed task using Ollama
 * @param transcriptContent The content of the transcript file
 * @param specContent The content of the SPEC.md file
 * @param architectureContent The content of the ARCHITECTURE.md file
 * @returns The generated task content
 */
async function createDetailedTask(
  transcriptContent: string, 
  specContent: string | undefined,
  architectureContent: string | undefined
): Promise<string> {
  console.log('Creating detailed task...');
  
  const contextInfo: string[] = [];
  if (specContent) contextInfo.push(`<SPEC>\n${specContent}</SPEC>`);
  if (architectureContent) contextInfo.push(`<ARCHITECTURE>\n${architectureContent}</ARCHITECTURE>`);
  
  const contextSection = contextInfo.length > 0 
    ? `\nFor context, here are the project's specification and architecture documents:\n\n${contextInfo.join('\n\n')}`
    : '';
  
  const prompt = `
You are tasked with creating a detailed task for an LLM to work on based on the following transcript.
The task should include a clear title, a careful explanation, and high-level action items.

${contextSection}

-- END OF CONTEXT --

What follows is the task requirement, this is the user's description of what needs to be speced:

<TASK-DETAILS>
${transcriptContent}
</TASK-DETAILS>

Create a detailed task with:
1. A clear, concise title as the first line (this will be extracted as the task title) (no more than 15 words)
2. A thorough explanation of what needs to be done
3. Specific action items or steps to complete the task, do not include filenames, function names, or any other specific implementation details. Just a high-level action items of what is involved to accomplish this task.
4. Any relevant technical considerations based on the context provided.

Provide the title as the first line with nothing else, as we'll extract just that line as the task title.
`;
  const response = await queryOllama(TASK_MODEL, prompt);
  return response.trim();
}

/**
 * Publishes a task as a Nostr event using nak
 * @param nsec The NSEC key for publishing
 * @param eventId The parent event ID
 * @param taskTitle The title of the task
 * @param taskContent The content of the task
 * @returns True if publishing was successful
 */
async function publishNostrEvent(
  nsec: string, 
  eventId: string, 
  taskTitle: string, 
  taskContent: string
): Promise<boolean> {
  console.log('Publishing Nostr event...');
  
  const relaysArray = RELAYS.split(' ');
  
  const proc = spawn([
    'nak', 'event', 
    '--sec', nsec, 
    '-k', '1934', 
    '-t', `a=${eventId}`, 
    '-t', `title=${taskTitle}`, 
    '-c', taskContent,
    ...relaysArray
  ], {
    stdio: ['inherit', 'inherit', 'inherit'],
  });
  
  const exitCode = await proc.exited;
  
  if (exitCode !== 0) {
    console.error(`Error publishing Nostr event, exit code: ${exitCode}`);
    return false;
  }
  
  console.log('Successfully published Nostr event');
  return true;
}

/**
 * Main function to process the transcript file
 * @param transcriptFilePath Path to the transcript file
 */
async function processTenexTask(transcriptFilePath: string) {
  console.log(`Processing Tenex task from: ${transcriptFilePath}`);
  
  try {
    // 1. Read the transcript file
    const absolutePath = path.resolve(transcriptFilePath);
    const transcriptFile = file(absolutePath);
    
    if (!await transcriptFile.exists()) {
      throw new Error(`Transcript file not found: ${absolutePath}`);
    }
    
    const transcriptContent = await transcriptFile.text();
    console.log(`Read transcript content (${transcriptContent.length} chars)`);
    
    // 2. Get list of project directories
    const projectDirs = await getProjectDirectories();
    if (projectDirs.length === 0) {
      throw new Error(`No project directories found in ${TENEX_PROJECTS_DIR}`);
    }
    
    // 3. Find the project name using Ollama
    const projectDir = await findProjectName(transcriptContent, projectDirs);
    
    // 4. Read the .tenex.json file
    const tenexConfig = await readTenexConfig(projectDir);
    const { nsec, eventId } = tenexConfig;
    
    if (!nsec || !eventId) {
      throw new Error('Missing nsec or eventId in .tenex.json');
    }
    
    // 5. Read context files
    const specPath = path.join(TENEX_PROJECTS_DIR, projectDir, 'context', 'SPEC.md');
    const architecturePath = path.join(TENEX_PROJECTS_DIR, projectDir, 'context', 'ARCHITECTURE.md');
    
    const specContent = await readFileIfExists(specPath);
    const architectureContent = await readFileIfExists(architecturePath);
    
    // 6. Create detailed task using Ollama
    const taskContent = await createDetailedTask(transcriptContent, specContent, architectureContent);
    
    // 7. Extract the first line as the task title
    const lines = taskContent.split('\n');
    const taskTitle = lines[0];
    
    // 8. Write task content to a temporary file
    const tempFilePath = path.join(process.cwd(), 'temp_task.md');
    await write(tempFilePath, taskContent);
    console.log(`Wrote task content to temporary file: ${tempFilePath}`);
    
    // 9. Publish as Nostr event
    const published = await publishNostrEvent(nsec, eventId, taskTitle, taskContent);
    
    if (published) {
      console.log('Task successfully published as Nostr event');
    } else {
      console.error('Failed to publish task as Nostr event');
    }
    
    // 10. Clean up temporary file
    try {
      await fs.unlink(tempFilePath);
    } catch (error) {
      console.warn(`Warning: Could not delete temporary file: ${tempFilePath}`);
    }
    
    console.log('Script finished successfully');
    
  } catch (error: any) {
    console.error(`Error during processing: ${error.message}`);
    process.exit(1);
  }
}

// Script execution
if (process.argv.length < 3) {
  console.error('Usage: bun tenex_task.ts <path_to_transcript_file>');
  process.exit(1);
}

const transcriptFilePathArg = process.argv[2];
processTenexTask(transcriptFilePathArg);