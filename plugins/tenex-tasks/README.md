# Tenex Task Generator

A tool that automatically creates detailed tasks for TENEX projects from transcripts, cleans them up, and provides context-rich tasks for your projects.

## Use case

Record an audio like "hey, I have this new tenex task for my project X: it should support blah blah blah".

On the other end of this plugin you have a task in the right project that is created taking into account the specs of that particular project, instead of some generic AI slop.

## Overview

The Tenex Task Generator consists of two main components:

1. **Plugin (`tenex_task.yaml`)**: Processes transcripts to identify project names and create structured task content
2. **Script (`tenex_task.ts`)**: Takes the generated content, identifies the specific Tenex project, and publishes a detailed task as a Nostr event

This tool streamlines the process of creating and assigning tasks for Tenex projects by:
- Automatically identifying which project a transcript refers to
- Generating well-structured tasks with titles and descriptions
- Publishing tasks directly to Nostr with proper references to the parent project

## Requirements

- [Bun](https://bun.sh/) runtime
- [Ollama](https://ollama.ai/) with the following models:
  - `llama3.2` (or configured alternative) for project identification
  - `qwen2.5` (or configured alternative) for task generation
- [nak](https://github.com/fiatjaf/nak) for Nostr event publishing
- Tenex projects directory with proper `.tenex.json` configuration files

## Installation

1. Copy `tenex_task.yaml` to your plugins directory
2. Copy `tenex_task.ts` to your run directory
3. Make the script executable:
   ```bash
   chmod +x run/tenex_task.ts
   ```

## Configuration

### Environment Variables

The script uses the following environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `TENEX_PROJECTS_DIR` | Directory containing Tenex projects | `/Users/pablofernandez/test123` |
| `FIND_PROJECT_MODEL` | Ollama model for project identification | `llama3.2` |
| `TASK_MODEL` | Ollama model for task generation | `qwen2.5` |
| `RELAYS` | Space-separated list of Nostr relays | `wss://relay.primal.net wss://relay.damus.io` |

### Tenex Project Structure

Each Tenex project in the `TENEX_PROJECTS_DIR` should have:

1. A `.tenex.json` file with the following structure:
   ```json
   {
     "pubkey": "c2e7055a3c3e1b323c99ea4368ea0f5a1833f2a8364b8998374b9f2b50fc3bcb",
     "title": "PROJECT_TITLE",
     "nsec": "NSEC_KEY",
     "hashtags": ["tenex"],
     "repoUrl": "git@github.com:username/repo.git",
     "eventId": "EVENT_ID"
   }
   ```

2. Optional context files in a `context` subdirectory:
   - `SPEC.md` - Project specifications
   - `ARCHITECTURE.md` - Project architecture details

These context files, if present, will be used to provide additional information to the task generation model.

## How It Works

1. The plugin processes a transcript and extracts the project name
2. The script:
   - Gets a list of all Tenex projects in the configured directory
   - Uses Ollama to identify which project the transcript refers to
   - Reads the project's `.tenex.json` file to get the NSEC key and event ID
   - Loads context files (SPEC.md and ARCHITECTURE.md) if they exist
   - Uses Ollama to generate a detailed task with title and description
   - Publishes the task as a Nostr event (kind 1934) with proper references to the parent project

## Plugin Configuration

The `tenex_task.yaml` plugin is configured as follows:

```yaml
name: tenex_task
description: Create a detailed task with title and description for a project mentioned in the transcript
type: or
run: matching
command: bun ./run/tenex_task.ts FILE
prompt: |
  Based on the following transcript, find the name of the project being worked on and create a detailed task with title and description.
  
  The extracted project name should be the first line of your response, followed by the raw transcript.
  
  Transcript:
  {transcript}
  
  Project: <insert-project-name-here>
  
  {transcript}
```

## Script Features

The `tenex_task.ts` script includes:

- Robust error handling for missing files or directories
- Temporary file management for Ollama prompts
- Intelligent project matching that handles directory name variations
- Context-aware task generation that incorporates project specifications and architecture
- Direct Nostr event publishing with proper tagging

## Example Usage

When a transcript mentions a Tenex project, the plugin will process it and the script will:

1. Identify the project (e.g., "TENEX" from "TENEX-pfkmc9")
2. Generate a detailed task with a clear title and description
3. Publish it as a Nostr event with proper references to the parent project

## Troubleshooting

- If the script fails to identify a project, check that the project directory exists in `TENEX_PROJECTS_DIR`
- If Ollama fails, ensure the configured models are installed
- If Nostr publishing fails, verify the NSEC key and relay configuration

