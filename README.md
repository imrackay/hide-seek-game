# Hide & Seek Game 2025

A modern 3D multiplayer hide-and-seek game built with Next.js, Three.js, and WebRTC. Features AI-powered camouflage system, positional voice chat, and immersive gameplay mechanics.

## 🎮 Features

### Core Gameplay
- **3D Multiplayer Environment**: Real-time multiplayer gameplay with up to 50 players per room
- **AI Camouflage System**: Intelligent environment analysis and object transformation
- **Role-Based Gameplay**: Dynamic hider/seeker roles with unique mechanics
- **Interactive Detection**: Advanced player interaction and discovery system

### Communication System
- **Text Chat**: Real-time messaging with content moderation
- **Voice Chat**: WebRTC-powered voice communication
- **Positional Audio**: 3D spatial audio based on player locations
- **Proximity Chat**: Distance-based voice communication

### User Experience
- **Authentication System**: User registration, login, and guest mode
- **Profile Management**: Comprehensive user profiles with statistics
- **Achievement System**: Unlockable achievements and progression
- **Social Features**: Friend system, blocking, and social interactions

### Technical Features
- **Real-time Networking**: WebSocket-based multiplayer synchronization
- **3D Graphics**: Three.js powered 3D rendering
- **Responsive Design**: Cross-platform compatibility
- **Performance Optimized**: Efficient rendering and network optimization

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Modern web browser with WebRTC support

### Installation

1. Clone the repository:
```bash
git clone https://github.com/imrackay/hide-seek-game.git
cd hide-seek-game
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

### Building for Production

```bash
npm run build
npm start
```

## 🏗️ Project Structure

```
hide-seek-game/
├── src/
│   ├── auth/                 # Authentication system
│   │   ├── AuthManager.ts
│   │   ├── SessionManager.ts
│   │   └── UserProfileManager.ts
│   ├── camouflage/          # AI camouflage system
│   │   ├── CamouflageManager.ts
│   │   └── PlayerTransformer.ts
│   ├── communication/       # Chat and voice systems
│   │   ├── TextChatManager.ts
│   │   ├── VoiceChatManager.ts
│   │   ├── PositionalAudioManager.ts
│   │   └── CommunicationManager.ts
│   ├── game/               # Core game logic
│   │   ├── GameManager.ts
│   │   ├── PlayerManager.ts
│   │   └── GameStateManager.ts
│   ├── interaction/        # Player interaction system
│   │   ├── InteractionManager.ts
│   │   ├── InteractionDetector.ts
│   │   └── HiderDiscoverySystem.ts
│   ├── map/               # Map and environment
│   │   ├── MapManager.ts
│   │   ├── MapLoader.ts
│   │   └── CollisionDetector.ts
│   ├── network/           # Networking layer
│   │   ├── NetworkManager.ts
│   │   └── WebSocketManager.ts
│   ├── rendering/         # 3D rendering
│   │   ├── RenderManager.ts
│   │   ├── SceneManager.ts
│   │   └── CameraManager.ts
│   └── types/             # TypeScript definitions
├── public/                # Static assets
├── .kiro/                # Project specifications
└── tests/                # Test files
```

## 🧪 Testing

Run the test suite:
```bash
npm test
```

Run tests in watch mode:
```bash
npm run test:watch
```

Generate coverage report:
```bash
npm run test:coverage
```

## 🎯 Game Mechanics

### Hider Role
- **Camouflage**: Transform into nearby objects using AI analysis
- **Movement Restrictions**: Limited movement while camouflaged
- **Objective**: Remain hidden until time runs out

### Seeker Role
- **Detection**: Interact with objects to discover hidden players
- **Time Pressure**: Find all hiders within the time limit
- **Tools**: Enhanced detection abilities and movement speed

### AI Camouflage System
- **Environment Analysis**: Real-time scanning of nearby objects
- **Smart Matching**: AI-powered selection of suitable camouflage options
- **Dynamic Transformation**: Seamless player-to-object transformation

## 🔊 Audio System

### Positional Audio Features
- **3D Spatial Audio**: Distance and direction-based audio
- **Proximity Zones**: Special audio areas with enhanced effects
- **Audio Quality Optimization**: Noise reduction and compression
- **Cross-platform Compatibility**: WebRTC-based voice communication

## 👥 Multiplayer Features

### Networking
- **Real-time Synchronization**: Sub-100ms latency for smooth gameplay
- **Scalable Architecture**: Support for up to 50 concurrent players
- **Connection Management**: Automatic reconnection and error handling

### Social System
- **Friend Management**: Add, remove, and manage friends
- **User Profiles**: Detailed statistics and achievement tracking
- **Communication Tools**: Text and voice chat with moderation

## 🛠️ Development

### Tech Stack
- **Frontend**: Next.js 14, React 18, TypeScript
- **3D Graphics**: Three.js, WebGL
- **Networking**: WebSocket, WebRTC
- **Testing**: Jest, React Testing Library
- **Styling**: CSS Modules, Tailwind CSS

### Development Commands
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run test         # Run tests
npm run lint         # Run ESLint
npm run type-check   # TypeScript type checking
```

## 📋 Roadmap

### Completed Features ✅
- [x] Project foundation and core infrastructure
- [x] 3D game engine with Three.js
- [x] WebSocket communication system
- [x] Multiplayer player management
- [x] Game state management
- [x] Map system with collision detection
- [x] AI camouflage system
- [x] Player interaction and detection
- [x] Communication system (text + voice)
- [x] Positional audio system
- [x] User authentication and profiles

### In Development 🚧
- [ ] Character customization system
- [ ] AR mode foundation
- [ ] Custom map builder
- [ ] Seasonal events system

### Planned Features 📅
- [ ] In-game store and monetization
- [ ] Streamer-friendly features
- [ ] Tournament system
- [ ] Anti-cheat measures
- [ ] Performance optimization
- [ ] Mobile app versions

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

### Development Setup
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and add tests
4. Commit your changes: `git commit -m 'Add amazing feature'`
5. Push to the branch: `git push origin feature/amazing-feature`
6. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Three.js community for excellent 3D graphics library
- WebRTC contributors for real-time communication capabilities
- Next.js team for the amazing React framework
- All contributors and testers who helped shape this game

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/imrackay/hide-seek-game/issues)
- **Discussions**: [GitHub Discussions](https://github.com/imrackay/hide-seek-game/discussions)
- **Email**: support@hideseekgame.com

---

**Built with ❤️ by the Hide & Seek Game Team**