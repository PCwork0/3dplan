/**
 * Ambient type stubs for @react-three/postprocessing and postprocessing.
 * These are replaced by the real types once `npm install` is run.
 * The actual runtime implementations come from the installed packages.
 */

declare module '@react-three/postprocessing' {
  import type { FC, ReactNode } from 'react';
  import type { BlendFunction, ToneMappingMode } from 'postprocessing';

  export const EffectComposer: FC<{
    children?: ReactNode;
    multisampling?: number;
    disableNormalPass?: boolean;
    enabled?: boolean;
  }>;

  export const SMAA: FC<Record<string, unknown>>;

  export const SSAO: FC<{
    samples?: number;
    radius?: number;
    intensity?: number;
    luminanceInfluence?: number;
    bias?: number;
    resolutionScale?: number;
    depthAwareUpsampling?: boolean;
    blendFunction?: BlendFunction;
  }>;

  export const Bloom: FC<{
    luminanceThreshold?: number;
    luminanceSmoothing?: number;
    intensity?: number;
    mipmapBlur?: boolean;
    blendFunction?: BlendFunction;
    levels?: number;
  }>;

  export const ToneMapping: FC<{
    mode?: ToneMappingMode;
    resolution?: number;
    whitePoint?: number;
    middleGrey?: number;
    minLuminance?: number;
    averageLuminance?: number;
    adaptationRate?: number;
  }>;

  export const Vignette: FC<{
    offset?: number;
    darkness?: number;
    eskil?: boolean;
    blendFunction?: BlendFunction;
  }>;
}

declare module 'postprocessing' {
  export enum BlendFunction {
    SCREEN = 16,
    ADD    = 4,
    NORMAL = 27,
  }

  export enum ToneMappingMode {
    LINEAR       = 0,
    REINHARD     = 1,
    REINHARD2    = 2,
    REINHARD2_ADAPTIVE = 3,
    UNCHARTED2   = 4,
    OPTIMIZED_CINEON = 5,
    ACES_FILMIC  = 6,
    AGX          = 7,
    NEUTRAL      = 8,
  }
}
