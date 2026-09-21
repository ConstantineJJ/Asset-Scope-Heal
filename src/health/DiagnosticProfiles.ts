import type { DiagnosticProfile, DiagnosticProfileId } from '../types';

export const DIAGNOSTIC_PROFILES: Record<DiagnosticProfileId, DiagnosticProfile> = {
  general: {
    id: 'general',
    label: 'General Inspection',
    description: 'Neutral inspection. Reports facts conservatively without assuming a delivery platform.',
    triangleWarning: 300000,
    drawCallWarning: 80,
    textureDimensionWarning: 4096,
    maxBoneInfluencesWarning: 4,
  },
  'desktop-game-character': {
    id: 'desktop-game-character',
    label: 'Desktop Game Character',
    description: 'Real-time desktop character with rig, skinning and animation expectations.',
    triangleWarning: 200000,
    drawCallWarning: 40,
    textureDimensionWarning: 4096,
    maxBoneInfluencesWarning: 4,
    expectsRig: true,
    expectsAnimations: true,
  },
  'mobile-game-character': {
    id: 'mobile-game-character',
    label: 'Mobile Game Character',
    description: 'Conservative real-time mobile character budget.',
    triangleWarning: 80000,
    drawCallWarning: 20,
    textureDimensionWarning: 2048,
    maxBoneInfluencesWarning: 4,
    expectsRig: true,
    expectsAnimations: true,
  },
  'static-prop': {
    id: 'static-prop',
    label: 'Static Prop',
    description: 'Static real-time object. Rig and animation are not expected.',
    triangleWarning: 150000,
    drawCallWarning: 30,
    textureDimensionWarning: 4096,
    maxBoneInfluencesWarning: 4,
    expectsRig: false,
    expectsAnimations: false,
  },
  'animated-character': {
    id: 'animated-character',
    label: 'Animated Character',
    description: 'Platform-neutral animated character inspection.',
    triangleWarning: 300000,
    drawCallWarning: 60,
    textureDimensionWarning: 4096,
    maxBoneInfluencesWarning: 4,
    expectsRig: true,
    expectsAnimations: true,
  },
  'mechanical-asset': {
    id: 'mechanical-asset',
    label: 'Mechanical Asset',
    description: 'Segmented mechanical/technical asset where disconnected parts may be intentional.',
    triangleWarning: 500000,
    drawCallWarning: 120,
    textureDimensionWarning: 4096,
    maxBoneInfluencesWarning: 4,
  },
  visualization: {
    id: 'visualization',
    label: 'Visualization / Render',
    description: 'High-fidelity visualization where runtime budgets are less restrictive.',
    triangleWarning: 1500000,
    drawCallWarning: 250,
    textureDimensionWarning: 8192,
    maxBoneInfluencesWarning: 8,
  },
};

export function getDiagnosticProfile(id: DiagnosticProfileId = 'general'): DiagnosticProfile {
  return DIAGNOSTIC_PROFILES[id] ?? DIAGNOSTIC_PROFILES.general;
}
