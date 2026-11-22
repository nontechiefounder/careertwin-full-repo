import React from 'react';
import { 
  Code, Hexagon, Cpu, Database, Cloud, 
  Layers, Zap, Globe, Github, Linkedin, 
  Terminal, Box, ShieldCheck, Container
} from 'lucide-react';

const icons = {
  golang: (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
  ),
  kubernetes: (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
  ),
  // ... more logic or just mapping lucide for now if we don't have raw SVGs
  react: Layers,
  typescript: Code,
  nodejs: Zap,
  python: Cpu,
  rust: Hexagon,
  postgresql: Database,
  kafka: Cpu,
  stripe: Globe,
  github: Github,
  linkedin: Linkedin,
  aws: Cloud,
  docker: Container,
  verified: ShieldCheck
};

export default function TechIcon({ name, ...props }) {
  const Icon = icons[name.toLowerCase()] || icons.golang;
  return <Icon {...props} />;
}
