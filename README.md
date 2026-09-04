# ⚡ Real-Time Voice-First AI Coding Assistant

[![Next.js](https://img.shields.io/badge/Next.js-15.0-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green?style=for-the-badge&logo=node.js)](https://nodejs.org/)
[![WebSockets](https://img.shields.io/badge/WebSockets-WS-blue?style=for-the-badge&logo=websocket)](https://github.com/websockets/ws)
[![Gemini API](https://img.shields.io/badge/Google_Gemini-2.5_Flash-8E75B5?style=for-the-badge&logo=googlegemini)](https://ai.google.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38BDF8?style=for-the-badge&logo=tailwindcss)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

An ultra-fast, voice-interactive AI coding partner and live execution environment powered by **Google Gemini 2.5 Multimodal Live API** over WebSockets. Speak your problem statements naturally, and watch complete, compilable source code generate, execute, and stream results in sub-second time.

---

## 🌟 Overview

The **Real-Time Voice-First AI Coding Assistant** bridges natural spoken conversation with instant, real-time code generation and sandbox execution. Built with a full-width **Cyberpunk Deep Dark Mode UI**, this application captures 16kHz PCM microphone audio, streams it bi-directionally via WebSockets to Gemini Multimodal Live, and triggers zero-preamble tool execution for C, C++, Python, Java, JavaScript, TypeScript, Go, and Rust.

### Key Highlights
- **Sub-Second Code Sandbox**: Compiles and executes code locally using `gcc`, `g++`, `python`, `node`, `java`, `go`, or `rustc`.
- **Automatic Cloud Fallback**: Seamlessly routes execution to the **Piston Cloud API** (`https://emkc.org/api/v2/piston/execute`) if local CLI compilers or runtimes are missing.
- **Custom STDIN Support**: Interactive input area allowing programs with `scanf`, `cin`, `getchar()`, or `input()` to receive custom inputs cleanly without hanging.
- **Live Vision Stream**: Streams 1 FPS webcam or screen-sharing frames to Gemini for real-time visual coding review and UI debugging.
- **PrismJS Syntax Highlighting**: Dark theme syntax highlighting with live code editing and instant re-running capabilities.

---

## 🏗️ System Architecture

```mermaid
flowchart TD
    subgraph Client ["Next.js Frontend (Port 3000)"]
        Mic[Microphone 16kHz PCM]
        Webcam[Webcam / Screen 1 FPS]
        UI[Voice Orb & Cyberpunk Sandbox]
        STDN[Custom STDIN Input]
    end

    subgraph Server ["Node.js Proxy Server (Port 8080)"]
        WSProxy[WebSocket Server]
        LangDetector[Language Safety Guard & Parser]
        LocalExec[Local Runner (GCC / G++ / Python / Java)]
        PistonAPI[Piston Cloud API Fallback]
    end

    subgraph Gemini ["Google AI Cloud"]
        LiveAPI[Gemini 2.5 Flash Native Audio API]
    end

    Mic -->|Binary PCM Chunks| WSProxy
    Webcam -->|Base64 JPEG Frames| WSProxy
    WSProxy <-->|Bi-directional WS Stream| LiveAPI
    LiveAPI -->|Tool Call: execute_code| WSProxy
    WSProxy --> LangDetector
    LangDetector --> LocalExec
    LocalExec -- missing CLI --> PistonAPI
    LocalExec -->|STDOUT / STDERR| WSProxy
    PistonAPI -->|STDOUT / STDERR| WSProxy
    WSProxy -->|CODE_EXECUTION Payload| UI
    STDN -->|RE_RUN_CODE + STDIN| WSProxy
```

---

## ✨ Features

- **⚡ Voice-First Interactive Coding**: Speak coding requests (e.g., *"Write a C program to find the largest element in an array"*) and receive instant live code execution.
- **🛡️ Strict Language Enforcer & Auto-Guard**: Prevents language carryover between turns. Code signatures (`#include <stdio.h>`, `<iostream>`, `public class`) are validated before compiler invocation to eliminate misrouting.
- **💻 Multi-Language Support**:
  - **C**: Compiled via `gcc -O2`
  - **C++**: Compiled via `g++ -O2`
  - **Python**: Executed via `python -u` (unbuffered)
  - **Java**: Saved matching `public class <ClassName>.java` and executed via `java`
  - **JavaScript / TypeScript**: Executed via `node` / `npx tsx`
  - **Go**: Executed via `go run`
  - **Rust**: Compiled via `rustc -O`
- **⌨️ Custom Program STDIN Input**: Easily toggle a program input box to supply numbers or string inputs for interactive programs.
- **🔁 One-Click Code Re-Execution**: Edit source code or change language in real time using the header `<select>` dropdown and click **▶ Run** to re-trigger compilation.
- **📸 Voice Photo Search**: Ask Gemini to show photographs or diagrams (*"Show me a picture of binary search tree"*), and real high-res images are dynamically fetched and presented in a lightbox.

---

## 🛠️ Tech Stack

### Frontend
- **Framework**: [Next.js 15](https://nextjs.org/) (App Router, Turbopack)
- **Language**: TypeScript, React 19
- **Styling**: Tailwind CSS (Cyberpunk glassmorphic palette `bg-[#05070e]`, cyan/violet neon glows)
- **Code Highlighting**: [PrismJS](https://prismjs.com/) (`prism-tomorrow.css` dark theme)
- **Audio Processing**: Web Audio API (`AudioContext`, `ScriptProcessorNode`, PCM 16-bit 16kHz audio conversion)

### Backend
- **Runtime**: Node.js 18+
- **WebSocket Protocol**: `ws` library
- **Execution Engine**: Node `child_process.exec` with process timeouts and stdin stream management
- **Cloud Fallback**: Piston Execution REST API (`https://emkc.org/api/v2/piston/execute`)

### AI Model
- **Engine**: Google Gemini 2.5 Multimodal Live API (`models/gemini-2.5-flash-native-audio-latest`)
- **Protocol**: Real-time bi-directional WebSockets (`wss://generativelanguage.googleapis.com`)

---

## 📋 Prerequisites

Before running the application, ensure you have the following installed on your machine:

1. **Node.js**: v18.0.0 or higher ([Download Node.js](https://nodejs.org/))
2. **C/C++ Compilers** *(Optional for local compilation)*:
   - **GCC / G++**: Install via MinGW-w64 on Windows or `build-essential` on Linux/macOS. Ensure `gcc` and `g++` are added to your system `PATH`.
3. **Python 3.x** *(Optional for local execution)*: Ensure `python` is added to system `PATH`.
4. **Google Gemini API Key**: Obtain a key from [Google AI Studio](https://aistudio.google.com/).

> 💡 **Note**: If `gcc`, `g++`, `python`, or `java` are not installed locally, the server automatically routes execution to the Piston Cloud API!

---

## 🚀 Quick Start & Installation

### 1. Clone the Repository

```bash
git clone https://github.com/chandanachandu0611-cloud/realtime-voice-coding-assistant.git
cd realtime-voice-coding-assistant
```

### 2. Configure & Start the Backend Server

```bash
# Navigate to server directory
cd server

# Install dependencies
npm install

# Create environment file
echo GEMINI_API_KEY=your_actual_gemini_api_key_here > .env
echo PORT=8080 >> .env

# Start the Node.js proxy server
node server.js
```

You should see:
```text
[Proxy] WebSocket server running on ws://localhost:8080
```

### 3. Configure & Start the Frontend Client

Open a new terminal window:

```bash
# Navigate to client directory
cd client

# Install dependencies
npm install

# Start Next.js development server
npm run dev
```

You should see:
```text
▲ Next.js 15.x (Turbopack)
✓ Ready in 1.2s on http://localhost:3000
```

### 4. Open Application

Open your browser and navigate to:
```text
http://localhost:3000
```

Click **"Start Session"**, grant microphone access, and start speaking your coding requests!

---

## 💻 Environment Variables

### Server Configuration (`server/.env`)

| Variable | Description | Required | Default |
| :--- | :--- | :--- | :--- |
| `GEMINI_API_KEY` | Google Gemini API Key from AI Studio | **Yes** | - |
| `PORT` | WebSocket Proxy Server Port | No | `8080` |

---

## 🧪 Usage Examples

### 1. Simple Voice Commands
- *"Write a C program using an array to calculate the sum of 5 numbers."*
- *"Show me a Python program to check if a string is a palindrome."*
- *"Write a Java program to reverse a linked list."*

### 2. Interactive Input (STDIN)
1. Ask Gemini for an interactive program: *"Write a C program that takes two integers from scanf and prints their sum."*
2. Once rendered in the **Live Execution Sandbox**, click **Custom Input**.
3. Type `25 75` into the **Program Input (STDIN)** box.
4. Click **▶ Run** to see `Sum = 100` printed instantly in the console output!

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

<p align="center">
  Crafted with ❤️ using Google Gemini 2.5 Native Audio & Next.js
</p>
