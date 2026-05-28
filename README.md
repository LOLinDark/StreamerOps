# StreamerOps

![Status](https://img.shields.io/badge/status-prototype-orange)
![License](https://img.shields.io/badge/license-GPL--3.0-blue)

StreamerOps is a browser-based OBS overlay control and stream management tool, built as a Progressive Web App (PWA) to bridge desktop-grade streaming workflows through the browser. Very new, basic, conceptual. 

The project combines live overlay control with agentic development tooling so creators can stand up overlays fast, iterate quickly, and apply focused changes in short time windows during production.

## Why This Project Exists

Live stream production often needs desktop-level flexibility, but traditional tooling can be heavy, fragmented, or slow to iterate.

StreamerOps explores a different approach:

- Browser-first control surface with PWA capabilities
- Faster iteration loop for overlay design and behavior
- Agent-assisted workflows for rapid setup and adjustment
- Practical path to bridge web and desktop streaming operations

## Project Goals

- Prototype a reliable web control layer for live overlays
- Reduce time-to-change during active streams
- Create reusable patterns for quick overlay deployment
- Validate an architecture that can scale from prototype to production

## Overlay Design Roadmap

Overlay design begins in React, where component-driven layouts and state handling provide fast iteration and clear structure.

Planned direction:

- Build overlays as reusable React components
- Introduce overlay templates and composable layout blocks
- Expand real-time control, synchronization, and scene management
- Continue improving authoring speed with agentic tooling support

## Key Innovations And Advantages

- Live overlay control from a web app: operate, adjust, and evolve scenes without relying solely on heavyweight desktop UI flows.
- PWA delivery model: installable and accessible like an app, while retaining web deployment speed.
- Agentic dev acceleration: shortens setup and change cycles by helping generate, wire, and refine overlay behavior quickly.
- Rapid iteration under production pressure: makes it easier to respond to stream context in minutes, not long rebuild cycles.

## Tech Stack

- Frontend: React + Vite
- Backend: Node.js + Express
- State and data flow: Zustand, React Query
- PWA support: vite-plugin-pwa
- Tooling: ESLint, Nodemon

## Getting Started

### Prerequisites

- Node.js 20+
- npm 10+

### Installation

```bash
npm install
```

### Run Development App

```bash
npm run dev
```

### Run API Server

```bash
npm run server
```

## Available Scripts

- npm run dev: Start Vite development server
- npm run build: Create production build
- npm run preview: Preview production build locally
- npm run lint: Run ESLint checks
- npm run server: Run backend server with Nodemon
- npm run build:guard: Build and run bundle budget checks
- npm run check:bundle: Check bundle budget constraints
- npm run ffmpeg:sync-core: Sync FFmpeg core assets
- npm run hotas:agent: Run HOTAS companion agent
- npm run hotas:agent:dry: Run HOTAS companion agent in dry-run mode

## High-Level Architecture

- app: React frontend, overlays, UI, control flows
- server: Express API, integration logic, peripherals
- public: Static and PWA assets
- scripts: Build and tooling automation
- documentation and developer-guide: Supporting project docs

## Current Status

This repository is an active prototype.

Expect rapid iteration, ongoing architecture tuning, and evolving interfaces as we validate workflow speed, reliability, and operator experience.

## Contributing

Contributions are welcome.

Suggested workflow:

1. Fork the repository
2. Create a feature branch
3. Make focused, well-scoped changes
4. Run lint and build checks
5. Open a pull request with clear context and testing notes

## Testing And Quality

- Use linting to maintain code quality
- Validate production builds before merge
- Keep changes small and reversible where possible
- Include notes for operator-impacting behavior changes

## Security

Do not commit secrets or environment credentials.

Use environment variables for sensitive configuration and follow least-privilege practices for integrations.

## License

This project is licensed under the GNU General Public License v3.0 (GPL-3.0).

See the [LICENSE](LICENSE) file for full terms.

## Support

If StreamerOps is useful to you, consider supporting development:

- ☕ [Buy Me a Coffee](https://buymeacoffee.com/ryanbayne)
- 💜 [GitHub Sponsors](https://github.com/sponsors/LOLinDark)

---

Built by [LOLinDark](https://github.com/LOLinDark)

## Contact And Project Direction

StreamerOps is currently focused on proving a browser-first, agent-accelerated model for live overlay operations.

The near-term priority is stabilizing React-first overlay authoring and tightening control loops for real-time stream production.
