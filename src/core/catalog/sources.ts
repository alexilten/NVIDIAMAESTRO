import type { SpecSource } from '../schema';

/**
 * Public sources behind the seed catalog. Every value in products.ts cites one of these.
 * Only public material belongs in this file: the repository is public.
 */
export const SOURCES: SpecSource[] = [
  {
    id: 'nv-dgx-spark-hw',
    kind: 'manufacturer-doc',
    title: 'DGX Spark User Guide — Hardware Overview',
    publisher: 'NVIDIA',
    url: 'https://docs.nvidia.com/dgx/dgx-spark/hardware.html',
    accessed: '2026-10-26',
    confidential: false,
  },
  {
    id: 'nv-dgx-b200-ug',
    kind: 'manufacturer-doc',
    title: 'NVIDIA DGX B200 User Guide — Introduction (Mechanical Specifications)',
    publisher: 'NVIDIA',
    url: 'https://docs.nvidia.com/dgx/dgxb200-user-guide/introduction-to-dgxb200.html',
    accessed: '2026-10-26',
    confidential: false,
  },
  {
    id: 'nv-rtx-pro-6000-maxq-ds',
    kind: 'manufacturer-doc',
    title: 'NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition datasheet',
    publisher: 'NVIDIA',
    url: 'https://www.nvidia.com/content/dam/en-zz/Solutions/products/workstations/professional-desktop-gpus/rtx-pro-6000-max-q/workstation-datasheet-blackwell-rtx-pro-6000-max-q-nvidia-us-5349650-web.pdf',
    reference: '5349650',
    accessed: '2026-10-26',
    confidential: false,
  },
  {
    id: 'nv-agx-orin-devkit-ds',
    kind: 'manufacturer-doc',
    title: 'Jetson AGX Orin Developer Kit datasheet (NVIDIA document, retrieved from a distributor mirror)',
    publisher: 'NVIDIA',
    url: 'https://uelectronics.com/wp-content/uploads/2023/06/jetson-agx-orin-developer-kit-datasheet-nvidia-a4-2203098-r1-web.pdf',
    reference: '2203098 r1',
    accessed: '2026-10-26',
    confidential: false,
  },
  {
    id: 'nv-agx-orin-devkit-layout',
    kind: 'manufacturer-doc',
    title: 'Jetson AGX Orin Developer Kit User Guide — Hardware Layout',
    publisher: 'NVIDIA',
    url: 'https://docs.nvidia.com/jetson/agx-orin-devkit/user-guide/latest/hardware_layout.html',
    accessed: '2026-10-26',
    confidential: false,
  },
  {
    id: 'nv-agx-thor-devkit-layout',
    kind: 'manufacturer-doc',
    title: 'Jetson AGX Thor Developer Kit User Guide — Hardware Layout',
    publisher: 'NVIDIA',
    url: 'https://docs.nvidia.com/jetson/agx-thor-devkit/user-guide/latest/hardware_layout.html',
    accessed: '2026-10-26',
    confidential: false,
  },
  {
    id: 'ws-agx-thor-devkit',
    kind: 'secondary',
    title: 'Jetson AGX Thor Developer Kit — distributor listing (mechanical)',
    publisher: 'Waveshare',
    url: 'https://www.waveshare.com/jetson-agx-thor-developer-kit.htm',
    accessed: '2026-10-26',
    confidential: false,
  },
  {
    id: 'gb-gb200-nvl72',
    kind: 'partner-page',
    title: 'GIGABYTE GIGAPOD — NVIDIA GB200 NVL72 (AI-DLC rack)',
    publisher: 'GIGABYTE',
    url: 'https://www.gigabyte.com/Enterprise/GIGAPOD-Rack-Scale/AI-DLC-Rack_NVIDIA-GB200-NVL72',
    accessed: '2026-10-26',
    confidential: false,
  },
  {
    id: 'nv-vera-rubin-nvl72',
    kind: 'manufacturer-page',
    title: 'NVIDIA Vera Rubin NVL72 (product page)',
    publisher: 'NVIDIA',
    url: 'https://www.nvidia.com/fr-fr/data-center/vera-rubin-nvl72/',
    accessed: '2026-10-26',
    confidential: false,
  },
  {
    id: 'nv-groot-n1-paper',
    kind: 'manufacturer-doc',
    title: 'NVIDIA Isaac GR00T N1: An Open Foundation Model for Humanoid Robots',
    publisher: 'NVIDIA Research',
    url: 'https://research.nvidia.com/publication/2025-03_nvidia-isaac-gr00t-n1-open-foundation-model-humanoid-robots',
    accessed: '2026-10-26',
    confidential: false,
  },
];

export const SOURCE_BY_ID = new Map(SOURCES.map((s) => [s.id, s]));
