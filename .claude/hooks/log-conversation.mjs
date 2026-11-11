#!/usr/bin/env node
// Claude Code hook: logs prompts + session transcripts into ai-log/ (AI-LOG.md appendix source).
// Never blocks Claude: all errors swallowed, always exit 0.
import fs from 'node:fs';
import path from 'node:path';

const MAX_TOOL_OUTPUT_CHARS = 1500;

const readStdin = () =>
  new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
  });

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const logDir = path.join(projectDir, 'ai-log');
const transcriptsDir = path.join(logDir, 'transcripts');

const shortId = (id) => String(id || 'unknown').slice(0, 8);
const truncate = (s, n) => (s.length > n ? `${s.slice(0, n)}\n… [truncated ${s.length - n} chars]` : s);
const fence = (s) => '```\n' + s.replace(/```/g, '`​``') + '\n```';

function appendPrompt(input) {
  const ts = new Date().toISOString();
  fs.appendFileSync(
    path.join(logDir, 'prompts.jsonl'),
    JSON.stringify({ ts, session_id: input.session_id, cwd: input.cwd, prompt: input.prompt }) + '\n',
  );
  fs.appendFileSync(
    path.join(logDir, 'prompts.md'),
    `\n## ${ts} · session \`${shortId(input.session_id)}\`\n\n${input.prompt}\n`,
  );
}

function blockToMarkdown(block) {
  if (typeof block === 'string') return block;
  switch (block.type) {
    case 'text':
      return block.text;
    case 'tool_use':
      return `**🔧 ${block.name}**\n${fence(truncate(JSON.stringify(block.input, null, 2), MAX_TOOL_OUTPUT_CHARS))}`;
    case 'tool_result': {
      const raw = Array.isArray(block.content)
        ? block.content.map((c) => (c.type === 'text' ? c.text : `[${c.type}]`)).join('\n')
        : String(block.content ?? '');
      const label = block.is_error ? '**⚠️ tool error**' : '**↳ tool result**';
      return `${label}\n${fence(truncate(raw, MAX_TOOL_OUTPUT_CHARS))}`;
    }
    case 'thinking':
    case 'redacted_thinking':
      return null;
    default:
      return `[${block.type}]`;
  }
}

function renderTranscript(jsonl, sessionId) {
  const out = [`# Transcript · session \`${sessionId}\`\n`];
  for (const line of jsonl.split('\n')) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if ((entry.type !== 'user' && entry.type !== 'assistant') || !entry.message) continue;
    const content = entry.message.content;
    const blocks = Array.isArray(content) ? content : [content];
    const parts = blocks.map(blockToMarkdown).filter(Boolean);
    if (!parts.length) continue;
    const isToolResultOnly = blocks.every((b) => b?.type === 'tool_result');
    const who = entry.type === 'assistant' ? '🤖 Claude' : isToolResultOnly ? '⚙️ Tool' : '👤 User';
    const sidechain = entry.isSidechain ? ' (subagent)' : '';
    out.push(`### ${who}${sidechain} · ${entry.timestamp ?? ''}\n\n${parts.join('\n\n')}\n`);
  }
  return out.join('\n');
}

function snapshotTranscript(input) {
  const src = input.transcript_path;
  if (!src || !fs.existsSync(src)) return;
  fs.mkdirSync(transcriptsDir, { recursive: true });
  const jsonl = fs.readFileSync(src, 'utf8');
  const base = path.join(transcriptsDir, input.session_id || path.basename(src, '.jsonl'));
  fs.writeFileSync(`${base}.jsonl`, jsonl);
  fs.writeFileSync(`${base}.md`, renderTranscript(jsonl, input.session_id));
}

try {
  const input = JSON.parse((await readStdin()) || '{}');
  fs.mkdirSync(logDir, { recursive: true });
  if (input.hook_event_name === 'UserPromptSubmit') appendPrompt(input);
  else snapshotTranscript(input); // Stop, SubagentStop, PreCompact, SessionEnd
} catch (err) {
  try {
    fs.appendFileSync(path.join(logDir, 'hook-errors.log'), `${new Date().toISOString()} ${err?.stack || err}\n`);
  } catch {}
}
process.exit(0);
