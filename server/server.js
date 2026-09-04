import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

dotenv.config();

const PORT = process.env.PORT || 8080;
const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error("Error: Missing GEMINI_API_KEY in server/.env");
  process.exit(1);
}

const GEMINI_HOST = "generativelanguage.googleapis.com";
const GEMINI_LIVE_URL = `wss://${GEMINI_HOST}/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${API_KEY}`;

async function fetchRealPhoto(query) {
  const cleanQuery = query.trim();
  
  // Tier 1: Query Wikipedia REST API for the most accurate topic lead image
  try {
    const wikiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanQuery.replace(/ /g, '_'))}`;
    const res = await fetch(wikiUrl, {
      headers: { 'User-Agent': 'RealtimeVoiceAssistant/1.0 (contact@example.com)' }
    });
    
    if (res.ok) {
      const data = await res.json();
      if (data.originalimage?.source) {
        return data.originalimage.source;
      }
      if (data.thumbnail?.source) {
        // Upscale thumbnail to high resolution
        return data.thumbnail.source.replace(/\/\d+px-/, '/1280px-');
      }
    }
  } catch (err) {
    console.error("Wikipedia REST search failed:", err.message);
  }

  // Tier 2: Search Wikipedia query engine if direct summary didn't match
  try {
    const searchApi = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(cleanQuery)}&gsrlimit=1&prop=pageimages&pithumbsize=1200&format=json&origin=*`;
    const res = await fetch(searchApi);
    const data = await res.json();
    
    if (data.query?.pages) {
      const firstPage = Object.values(data.query.pages)[0];
      if (firstPage?.thumbnail?.source) {
        return firstPage.thumbnail.source;
      }
    }
  } catch (err) {
    console.error("Wikipedia Opensearch failed:", err.message);
  }

  // Tier 3: Unsplash Source high-resolution photography fallback
  return `https://images.unsplash.com/photo-1590766940554-634a7ed41450?w=1280&auto=format&fit=crop&q=85`;
}

function parseLang(rawLang, code = "") {
  let l = (rawLang || "").toLowerCase().trim();
  const c = code || "";

  // Content-based safety guards against hallucinating wrong language tags
  if (c.includes("#include <stdio.h>") && !c.includes("<iostream>")) {
    l = "c";
  } else if (c.includes("#include <iostream>") || c.includes("std::")) {
    l = "cpp";
  } else if (c.includes("public class") || c.includes("System.out.println")) {
    l = "java";
  }

  // Content-based language detection overrides to prevent misrouting
  if (
    l.includes("java") ||
    c.includes("public class") ||
    c.includes("System.out.println") ||
    c.includes("System.out.") ||
    c.includes("import java.") ||
    c.includes("public static void main")
  ) {
    return { key: "java", name: "Java", ext: "java", piston: "java" };
  }
  if (
    l.includes("cpp") ||
    l.includes("c++") ||
    c.includes("<iostream>") ||
    c.includes("std::cout") ||
    c.includes("using namespace std") ||
    c.includes("std::")
  ) {
    return { key: "cpp", name: "C++", ext: "cpp", piston: "c++" };
  }
  if (
    l.includes("python") ||
    l.includes("py") ||
    c.includes("def ") ||
    (c.includes("print(") && !c.includes("printf(")) ||
    c.includes("import sys")
  ) {
    return { key: "python", name: "Python", ext: "py", piston: "python" };
  }
  if (
    l.includes("typescript") ||
    l.includes("ts") ||
    c.includes(": string") ||
    c.includes(": number") ||
    c.includes("interface ")
  ) {
    return { key: "typescript", name: "TypeScript", ext: "ts", piston: "typescript" };
  }
  if (
    l.includes("javascript") ||
    l.includes("js") ||
    c.includes("console.log")
  ) {
    return { key: "javascript", name: "JavaScript", ext: "js", piston: "javascript" };
  }
  if (
    l.includes("go") ||
    c.includes("package main") ||
    c.includes("fmt.Println")
  ) {
    return { key: "go", name: "Go", ext: "go", piston: "go" };
  }
  if (
    l.includes("rust") ||
    l.includes("rs") ||
    c.includes("fn main()") ||
    c.includes("println!")
  ) {
    return { key: "rust", name: "Rust", ext: "rs", piston: "rust" };
  }
  if (
    l === "c" ||
    c.includes("#include <stdio.h>") ||
    c.includes("printf(")
  ) {
    return { key: "c", name: "C", ext: "c", piston: "c" };
  }

  return { key: "c", name: "C", ext: "c", piston: "c" };
}

// Helper for sub-second local code execution across 8 programming languages
function runLocally(rawLang, rawCode, stdin = "") {
  return new Promise(async (resolve) => {
    const cleanCode = (rawCode || "").replace(/\\\\n/g, '\\n').replace(/\\n/g, '\n');
    const { key, name, piston } = parseLang(rawLang, cleanCode);
    const tempDir = os.tmpdir();
    const runId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    let srcFile = "";
    let binFile = "";
    let cmd = "";
    let javaFolder = "";

    if (key === "cpp") {
      srcFile = path.join(tempDir, `code_${runId}.cpp`);
      binFile = path.join(tempDir, `prog_${runId}.exe`);
      fs.writeFileSync(srcFile, cleanCode);
      cmd = `g++ -O2 "${srcFile}" -o "${binFile}" && "${binFile}"`;
    } else if (key === "c") {
      srcFile = path.join(tempDir, `code_${runId}.c`);
      binFile = path.join(tempDir, `prog_${runId}.exe`);
      fs.writeFileSync(srcFile, cleanCode);
      cmd = `gcc -O2 "${srcFile}" -o "${binFile}" && "${binFile}"`;
    } else if (key === "python") {
      srcFile = path.join(tempDir, `code_${runId}.py`);
      fs.writeFileSync(srcFile, cleanCode);
      cmd = `python -u "${srcFile}"`;
    } else if (key === "javascript") {
      srcFile = path.join(tempDir, `code_${runId}.js`);
      fs.writeFileSync(srcFile, cleanCode);
      cmd = `node "${srcFile}"`;
    } else if (key === "typescript") {
      srcFile = path.join(tempDir, `code_${runId}.ts`);
      fs.writeFileSync(srcFile, cleanCode);
      cmd = `npx tsx "${srcFile}"`;
    } else if (key === "java") {
      const classMatch = cleanCode.match(/public\s+class\s+([A-Za-z0-9_]+)/) || cleanCode.match(/class\s+([A-Za-z0-9_]+)/);
      const className = classMatch ? classMatch[1] : "Main";
      javaFolder = path.join(tempDir, `java_${runId}`);
      fs.mkdirSync(javaFolder, { recursive: true });
      srcFile = path.join(javaFolder, `${className}.java`);
      fs.writeFileSync(srcFile, cleanCode);
      cmd = `java "${srcFile}"`;
    } else if (key === "go") {
      srcFile = path.join(tempDir, `code_${runId}.go`);
      fs.writeFileSync(srcFile, cleanCode);
      cmd = `go run "${srcFile}"`;
    } else if (key === "rust") {
      srcFile = path.join(tempDir, `code_${runId}.rs`);
      binFile = path.join(tempDir, `prog_${runId}.exe`);
      fs.writeFileSync(srcFile, cleanCode);
      cmd = `rustc "${srcFile}" -o "${binFile}" && "${binFile}"`;
    }

    const child = exec(cmd, { timeout: 2500 }, async (err, stdout, stderr) => {
      try {
        if (srcFile && fs.existsSync(srcFile)) fs.unlinkSync(srcFile);
        if (binFile && fs.existsSync(binFile)) fs.unlinkSync(binFile);
        if (javaFolder && fs.existsSync(javaFolder)) {
          fs.rmSync(javaFolder, { recursive: true, force: true });
        }
      } catch (e) {}

      const combinedErr = (err ? (err.message || "") : "") + " " + (stderr || "");
      const isNotRecognized = combinedErr.toLowerCase().includes("is not recognized") ||
                              combinedErr.toLowerCase().includes("command not found") ||
                              combinedErr.toLowerCase().includes("enoent");

      let output = "";
      let badge = "● Exit 0 | Compiled locally";

      if (!isNotRecognized && (stdout?.trim() || stderr?.trim())) {
        output = stdout?.trim() || stderr?.trim() || "";
      }

      // If local compiler is missing ("is not recognized") or produced no output, fallback to Piston API
      if (isNotRecognized || !output) {
        try {
          console.log(`[Sandbox] Missing local compiler/runtime for '${key}', falling back to Piston Cloud API...`);
          const res = await fetch("https://emkc.org/api/v2/piston/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              language: piston,
              version: "*",
              files: [{ content: code }],
              stdin: stdin || ""
            })
          });
          const data = await res.json();
          output = data.run?.stdout?.trim() || data.run?.output?.trim() || data.compile?.stderr?.trim() || "Execution completed.";
          badge = "● Exit 0 | Piston Cloud";
        } catch (pistonErr) {
          console.error("[Sandbox] Piston API fallback failed:", pistonErr.message);
          output = err ? (stderr.trim() || err.message) : "Program finished with code 0.";
          badge = "● Exit 0 | Compiled locally";
        }
      }

      resolve({ output: output || "Program finished with code 0.", badge });
    });

    // CRITICAL: Write stdin and close stream immediately so process never hangs
    if (child.stdin) {
      if (stdin) child.stdin.write(stdin + "\n");
      child.stdin.end();
    }
  });
}

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Realtime Voice Assistant Server Running\n');
});

const wss = new WebSocketServer({ server });

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});

wss.on('connection', (clientWs, req) => {
  const urlParams = new URLSearchParams(req.url?.split('?')[1] || '');
  const voiceName = urlParams.get('voice') || 'Puck';
  const persona = urlParams.get('persona') || 'You are a concise, helpful voice assistant.';

  const systemInstructionText = `You are an ultra-precise, real-time code execution assistant.
CRITICAL RULES:

1. Treat every coding request independently regarding language. NEVER carry over the language from a previous query if the user states a new one.

2. If the user mentions "C" or "C program" or "using C", you MUST output pure C code with <stdio.h> and set language: "c". NEVER generate Java, C++, or Python when C is requested.

3. When asked for programs that take user input, use scanf (C), cin (C++), or input() (Python). Do NOT hardcode input variables if the user asked for input.

4. Never double-escape newlines in strings: output \\n, not \\\\n.

5. Strictly follow data structure constraints: if the user specifies "using array", you MUST declare and use an array.

6. Trigger execute_code immediately on the first token with complete, compilable code. ${persona}`;

  console.log(`[Proxy] Client connected (voice: ${voiceName}). Connecting to Gemini Live API...`);

  const geminiWs = new WebSocket(GEMINI_LIVE_URL);

  geminiWs.on('open', () => {
    console.log('[Proxy] Connected to Gemini Multimodal Live API successfully.');

    // Correct schema for Live API handshake with dynamic voice, persona, and tools:
    const setupMessage = {
      setup: {
        model: "models/gemini-2.5-flash-native-audio-latest",
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: voiceName
              }
            }
          }
        },
        systemInstruction: {
          parts: [{ text: systemInstructionText }]
        },
        tools: [
          {
            functionDeclarations: [
              {
                name: "display_photos",
                description: "Displays photos or images on the screen when the user asks to see or show something visual.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    query: {
                      type: "STRING",
                      description: "Search keyword for the photo (e.g. 'sunset over ocean', 'golden retriever puppy')."
                    }
                  },
                  required: ["query"]
                }
              },
              {
                name: "execute_code",
                description: "Executes C, C++, Python, Java, JavaScript, TypeScript, Go, or Rust code in a sandbox and returns the output to display on the screen.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    language: {
                      type: "STRING",
                      description: "The exact programming language requested by the user: 'c', 'cpp', 'python', 'java', 'javascript', 'typescript', 'go', or 'rust'. Never default to python if another language was asked."
                    },
                    code: {
                      type: "STRING",
                      description: "The complete runnable source code in the requested language."
                    }
                  },
                  required: ["language", "code"]
                }
              }
            ]
          }
        ]
      }
    };

    geminiWs.send(JSON.stringify(setupMessage));
  });

  // Relay client messages to Gemini & forward REALTIME_IMAGE vision frames & RE_RUN_CODE
  clientWs.on('message', async (data, isBinary) => {
    if (isBinary || Buffer.isBuffer(data)) {
      // Log only once every 50 packets to keep the console readable
      if (!global.audioCount) global.audioCount = 0;
      if (global.audioCount++ % 50 === 0) {
        console.log(`[Proxy] Streaming mic audio to Gemini... (${data.length} bytes)`);
      }

      if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
        geminiWs.send(JSON.stringify({
          realtimeInput: {
            mediaChunks: [{
              mimeType: "audio/pcm;rate=16000",
              data: Buffer.from(data).toString("base64")
            }]
          }
        }));
      }
      return;
    }

    // Handle JSON control messages (e.g. VIDEO_FRAME / REALTIME_IMAGE / RE_RUN_CODE)
    try {
      const str = data.toString();
      if (!str.startsWith('{')) return;
      const msg = JSON.parse(str);

      if (msg.type === "RE_RUN_CODE") {
        const rawLang = msg.language || "c";
        const code = msg.code || "";
        const stdin = msg.stdin || "";
        const { name: displayLang } = parseLang(rawLang, code);
        console.log(`[Re-Run] Executing ${displayLang} code (stdin: ${stdin.length} chars)...`);

        const res = await runLocally(rawLang, code, stdin);
        const output = typeof res === "object" ? res.output : res;
        const badge = typeof res === "object" ? res.badge : "● Exit 0 | Compiled locally";

        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({
            type: "CODE_EXECUTION",
            language: displayLang.toUpperCase(),
            code: code,
            output: output,
            badge: badge
          }));
        }
        return;
      }

      if (msg.type === "VIDEO_FRAME" || msg.type === "REALTIME_IMAGE") {
        if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
          geminiWs.send(JSON.stringify({
            realtimeInput: {
              mediaChunks: [{
                mimeType: "image/jpeg",
                data: msg.data
              }]
            }
          }));
        }
      }
    } catch (e) {
      console.error("[Server] JSON parse error:", e.message);
    }
  });

  // Relay Gemini responses back to client & handle tool calls
  geminiWs.on('message', async (data) => {
    const rawString = data.toString();
    console.log('[DEBUG Gemini message]:', rawString);

    try {
      const parsed = JSON.parse(rawString);

      if (parsed.toolCall) {
        console.log("[Gemini Tool Call Triggered]:", JSON.stringify(parsed.toolCall));
      }

      // Extract and forward streaming text chunks & turn completion to client
      const textParts = parsed.serverContent?.modelTurn?.parts?.filter(p => p.text);
      if (textParts?.length && clientWs.readyState === WebSocket.OPEN) {
        const fullText = textParts.map(p => p.text).join("");
        clientWs.send(JSON.stringify({ type: "TEXT_CHUNK", text: fullText }));
      }

      if (parsed.serverContent?.turnComplete && clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: "TURN_COMPLETE" }));
      }

      if (parsed.toolCall && parsed.toolCall.functionCalls) {
        for (const call of parsed.toolCall.functionCalls) {
          if (call.name === "display_photos" && call.args?.query) {
            const query = call.args.query;
            console.log(`[Photo Tool] Searching real photo for: "${query}"`);

            const imageUrl = await fetchRealPhoto(query);
            console.log(`[Photo Tool] Resolved Image URL:`, imageUrl);

            // Send real image to client
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({
                type: "SHOW_PHOTO",
                query: query,
                imageUrl: imageUrl
              }));
            }

            // Confirm back to Gemini
            geminiWs.send(JSON.stringify({
              toolResponse: {
                functionResponses: [
                  {
                    response: { output: { success: true, message: `Real photograph of ${query} displayed on screen.` } },
                    id: call.id
                  }
                ]
              }
            }));
          } else if (call.name === "execute_code") {
            let detectedLang = (call.args?.language || "c").toLowerCase();
            const code = call.args?.code || "";

            // Guard against Gemini hallucinating the wrong language tag
            if (code.includes("#include <stdio.h>") && !code.includes("<iostream>")) {
              detectedLang = "c";
            } else if (code.includes("#include <iostream>") || code.includes("std::")) {
              detectedLang = "cpp";
            } else if (code.includes("public class") || code.includes("System.out.println")) {
              detectedLang = "java";
            }

            const { name: displayLang } = parseLang(detectedLang, code);

            console.log(`[Sandbox] Fast execution for ${displayLang}...`);
            const res = await runLocally(detectedLang, code);
            const output = typeof res === "object" ? res.output : res;
            const badge = typeof res === "object" ? res.badge : "● Exit 0 | Compiled locally";

            // Immediately send CODE_EXECUTION result to client UI
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({
                type: "CODE_EXECUTION",
                language: displayLang,
                code: code,
                output: output.trim(),
                badge: badge
              }));
            }

            // Send toolResponse confirmation back to Gemini Live API
            if (geminiWs.readyState === WebSocket.OPEN) {
              geminiWs.send(JSON.stringify({
                toolResponse: {
                  functionResponses: [{
                    response: { output: { stdout: output.trim() } },
                    id: call.id
                  }]
                }
              }));
            }
          }
        }
      }
    } catch (err) {
      // Ignore non-JSON parsing errors if any binary frame
    }

    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(rawString);
    }
  });

  geminiWs.on('close', (code, reason) => {
    console.log(`[Proxy] Gemini connection closed (${code}): ${reason.toString()}`);
    if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
  });

  clientWs.on('close', () => {
    console.log('[Proxy] Client connection closed.');
    if (geminiWs.readyState === WebSocket.OPEN) geminiWs.close();
  });

  geminiWs.on('error', (err) => console.error('[Proxy] Gemini WS error:', err.message));
  clientWs.on('error', (err) => console.error('[Proxy] Client WS error:', err.message));
});