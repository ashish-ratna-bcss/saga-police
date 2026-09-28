# Saga-Police (Soceye) - Production Server Deployment

This document outlines the deployment details, server specifications, and process management for the **Saga-Police / Soceye** application.

## 🏢 Server Identity & Access
- **SSH Alias**: `iccc-ws`
- **IP Address**: `172.16.218.135`
- **Hostname**: `cat-hyd-work-station-HP-Z2-Tower-G1i-Workstation-Desktop-PC`
- **User**: `cat-hyd-work-station`

## 💻 Hardware Specifications
- **Operating System**: Ubuntu 24.04.4 LTS (Kernel: 6.17.0-1032-oem)
- **Processor**: Intel(R) Core(TM) Ultra 9 285K (24 CPUs)
- **Memory (RAM)**: 62 GiB Total
- **Swap Space**: 8.0 GiB Total

## 📂 Deployment Paths
The application is deployed directly on the server under the `cat-hyd-work-station` home directory.

- **Git Repository**: `https://github.com/ashish-ratna-bcss/saga-police.git`
- **Active Branch**: `soceye`
- **Root Project Path**: `/home/cat-hyd-work-station/SOCEYE`
- **RAG Pipeline Path**: `/home/cat-hyd-work-station/SOCEYE/RAG_pipline_saga`

## ⚙️ Process Management (PM2)
The ecosystem runs multiple background services managed by **PM2**. You can view their status by running:
```bash
pm2 status
```

**Key Ecosystem Processes:**
- `soceye-rag` (Handles RAG APIs, HotCacheManager, and Embeddings)
- `soceye-backend` & `soceye-frontend`
- `sentiment-api`
- `CopWriter-backend`, `CopWriter-frontend`, & `CopWriter-gpu-worker`
- `copint-osint`
- `hcp-backend`

## 🔄 Routine Update Workflow
When pushing new code to the `soceye` branch, follow these steps to update the server:

```bash
# 1. Access the server
ssh iccc-ws

# 2. Navigate to the project directory
cd /home/cat-hyd-work-station/SOCEYE

# 3. Pull the latest code (autostash preserves critical unversioned PDFs and file permissions)
git pull origin soceye --autostash

# 4. Restart the target service (e.g., RAG)
pm2 restart soceye-rag
```
