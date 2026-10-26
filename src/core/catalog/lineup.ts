import type { PhysicalAsset, ProductFamily, ProductModel } from '../schema';
import { DUAL_SLOT, IN, REVIEWED, dims, proxy, s, unknownDims } from './helpers';

/**
 * Round 02: the current NVIDIA exhibition hardware line-up, from DGX Station desksides to Vera Rubin racks.
 * Every value comes from the public document cited with it. Where no mechanical specification is published
 * yet (most Vera Rubin generation racks and trays), the record keeps its stated facts and a placeholder
 * envelope, so nothing is drawn. Photographs of built stands are never a source.
 */

type ModelInput = Omit<ProductModel, 'lastReviewed' | 'industries' | 'related' | 'specs' | 'tags'> & Partial<Pick<ProductModel, 'industries' | 'related' | 'specs' | 'tags'>>;
const model = (m: ModelInput): ProductModel => ({ industries: ['AI factory'], related: [], specs: [], tags: [], ...m, lastReviewed: REVIEWED });

/** a record whose envelope is not published: facts only, no geometry */
const unknown = (id: string, modelId: string): PhysicalAsset => ({ id, modelId, dims: unknownDims(), interfaces: [], digitalAssets: [] });

const NOT_PUBLISHED = 'No mechanical specification is published yet, so the envelope is a placeholder and nothing is drawn.';

export const LINEUP_FAMILIES: ProductFamily[] = [
  { id: 'fam-dgx-station', name: 'DGX Station', manufacturer: 'NVIDIA', category: 'workstation', description: 'Deskside AI supercomputers built on the GB300 Grace Blackwell Ultra Desktop Superchip. NVIDIA defines the platform; Dell, GIGABYTE, HP, MSI and Supermicro build the systems, each with its own chassis.' },
  { id: 'fam-rtx-pro-server', name: 'RTX PRO Servers', manufacturer: 'NVIDIA', category: 'data-center', description: 'Enterprise servers with RTX PRO Blackwell Server Edition GPUs, built by NVIDIA system partners in 2U, 4U and 6U configurations.' },
  { id: 'fam-aerial', name: 'Aerial RAN Computer', manufacturer: 'NVIDIA', category: 'edge', description: 'GPU-accelerated AI-RAN systems for telecommunications, built by partners on NVIDIA MGX.' },
  { id: 'fam-spectrum-x', name: 'Spectrum-X Ethernet', manufacturer: 'NVIDIA', category: 'networking', description: 'Spectrum-6 Ethernet switches for AI factories, including the co-packaged-optics Spectrum-X Ethernet Photonics systems.' },
  { id: 'fam-supernic-dpu', name: 'SuperNICs and DPUs', manufacturer: 'NVIDIA', category: 'networking', description: 'ConnectX SuperNICs and BlueField data processing units.' },
  { id: 'fam-ai-storage', name: 'BlueField-4 STX and CMX storage', manufacturer: 'NVIDIA', category: 'data-center', description: 'AI storage built on the BlueField-4 STX storage processor, including the CMX context memory storage platform and its partner systems.' },
  { id: 'fam-groq-lpx', name: 'Groq 3 LPX', manufacturer: 'NVIDIA', category: 'data-center', description: 'Rack-scale inference systems built from language processing units (LPUs).' },
  { id: 'fam-vera-cpu', name: 'Vera CPU systems', manufacturer: 'NVIDIA', category: 'data-center', description: 'Dense, liquid-cooled racks of NVIDIA Vera CPUs.' },
];

export const LINEUP_MODELS: ProductModel[] = [
  // ── DGX Station ──
  model({
    id: 'nv-dgx-station-gb300', familyId: 'fam-dgx-station', name: 'NVIDIA DGX Station (GB300)', manufacturer: 'NVIDIA', kind: 'reference-architecture', status: 'shipping',
    description: 'A deskside AI system around the GB300 Grace Blackwell Ultra Desktop Superchip with up to 748 GB of coherent memory. Each partner system is a separate physical product with its own dimensions.',
    purpose: 'Developing, fine-tuning and running large AI models at the desk.', industries: ['AI development', 'Research', 'Enterprise AI'],
    specs: [
      { label: 'Superchip', spec: s<string>('NVIDIA GB300 Grace Blackwell Ultra Desktop Superchip', 'verified', 'gb-w775') },
      { label: 'Coherent memory', spec: s<string>('up to 748 GB (496 GB LPDDR5X + 252 GB HBM3E)', 'verified', 'gb-w775') },
    ],
    implementations: ['dell-pro-max-gb300', 'gb-w775-v10', 'hp-zgx-fury-g1n', 'msi-ws300', 'smc-ars-511gd'],
    related: ['nv-dgx-spark', 'nv-rtx-pro-6000-ws'], tags: ['dgx station', 'gb300', 'deskside', 'desktop', 'grace blackwell ultra', 'windows'],
    sources: ['gb-w775', 'msi-ws300'],
  }),
  model({
    id: 'dell-pro-max-gb300', familyId: 'fam-dgx-station', name: 'Dell Pro Max with GB300', manufacturer: 'Dell Technologies', kind: 'system', status: 'shipping',
    description: 'Dell’s DGX Station system (model FCT6263), a deskside tower.', purpose: 'One physical implementation of DGX Station.', industries: ['AI development', 'Enterprise AI'],
    specs: [{ label: 'Power cord', spec: s<string>('C19', 'verified', 'dell-pro-max-gb300') }],
    physicalAssetId: 'pa-dell-pro-max-gb300', related: ['nv-dgx-station-gb300'], tags: ['dgx station', 'gb300', 'dell', 'tower', 'fct6263'], sources: ['dell-pro-max-gb300'],
  }),
  model({
    id: 'gb-w775-v10', familyId: 'fam-dgx-station', name: 'GIGABYTE W775-V10-L01', manufacturer: 'GIGABYTE', kind: 'system', status: 'shipping',
    description: 'GIGABYTE’s DGX Station system, a liquid-cooled deskside pedestal.', purpose: 'One physical implementation of DGX Station.', industries: ['AI development', 'Enterprise AI'],
    specs: [
      { label: 'Power supply', spec: s<string>('1 × 1600 W ATX 80 PLUS Platinum; C19 cord; 20 A circuit', 'verified', 'gb-w775') },
      { label: 'Cooling', spec: s<string>('Closed-loop liquid cooling; 3 × 120 mm system fans', 'verified', 'gb-w775') },
    ],
    physicalAssetId: 'pa-gb-w775-v10', related: ['nv-dgx-station-gb300'], tags: ['dgx station', 'gb300', 'gigabyte', 'pedestal', 'liquid cooled'], sources: ['gb-w775'],
  }),
  model({
    id: 'hp-zgx-fury-g1n', familyId: 'fam-dgx-station', name: 'HP ZGX Fury G1n AI Station', manufacturer: 'HP', kind: 'system', status: 'shipping',
    description: `HP’s DGX Station system. It stands as a tower or mounts in a 5U rack with the included rails. HP’s QuickSpecs, which carry the dimensions, could not be read; ${NOT_PUBLISHED.toLowerCase()}`,
    purpose: 'One physical implementation of DGX Station.', industries: ['AI development', 'Enterprise AI'],
    specs: [
      { label: 'Mounting', spec: s<string>('Tower, or 5U rack with included rails', 'verified', 'hp-zgx-fury') },
      { label: 'Power', spec: s<string>('C20 AC inlet; dedicated 200–240 V AC circuit', 'verified', 'hp-zgx-fury') },
      { label: 'Networking', spec: s<string>('2 × QSFP112 (400 Gbps), RJ-45 10 Gbps', 'verified', 'hp-zgx-fury') },
    ],
    physicalAssetId: 'pa-hp-zgx-fury-g1n', related: ['nv-dgx-station-gb300'], tags: ['dgx station', 'gb300', 'hp', 'zgx', 'tower', '5u'], sources: ['hp-zgx-fury'],
  }),
  model({
    id: 'msi-ws300', familyId: 'fam-dgx-station', name: 'MSI XpertStation WS300', manufacturer: 'MSI', kind: 'system', status: 'shipping',
    description: 'MSI’s DGX Station system, a deskside tower.', purpose: 'One physical implementation of DGX Station.', industries: ['AI development', 'Enterprise AI'],
    specs: [
      { label: 'Power supply', spec: s<string>('1600 W 80 PLUS Platinum ATX', 'verified', 'msi-ws300') },
      { label: 'Networking', spec: s<string>('2 × 400 GbE QSFP (ConnectX-8), 1 × 10 GbE RJ45', 'verified', 'msi-ws300') },
    ],
    physicalAssetId: 'pa-msi-ws300', related: ['nv-dgx-station-gb300'], tags: ['dgx station', 'gb300', 'msi', 'tower', 'xpertstation'], sources: ['msi-ws300'],
  }),
  model({
    id: 'smc-ars-511gd', familyId: 'fam-dgx-station', name: 'Supermicro Super AI Station ARS-511GD-NB-LCC', manufacturer: 'Supermicro', kind: 'system', status: 'shipping',
    description: 'Supermicro’s DGX Station system, for use as a tower or in a 5U rack.', purpose: 'One physical implementation of DGX Station.', industries: ['AI development', 'Enterprise AI'],
    specs: [
      { label: 'Form factor', spec: s<string>('Tower or 5U', 'verified', 'smc-ars-511gd') },
      { label: 'Power supply', spec: s<string>('1 × 1600 W Titanium', 'verified', 'smc-ars-511gd') },
      { label: 'Cooling', spec: s<string>('Closed-loop direct-to-chip liquid cooling; 2 × 140 mm fans', 'verified', 'smc-ars-511gd') },
    ],
    physicalAssetId: 'pa-smc-ars-511gd', related: ['nv-dgx-station-gb300'], tags: ['dgx station', 'gb300', 'supermicro', 'tower', '5u', 'liquid cooled'], sources: ['smc-ars-511gd'],
  }),

  // ── RTX PRO boards ──
  model({
    id: 'nv-rtx-pro-6000-ws', familyId: 'fam-rtx-pro', name: 'NVIDIA RTX PRO 6000 Blackwell Workstation Edition', manufacturer: 'NVIDIA', kind: 'board', status: 'shipping',
    description: 'A dual-slot, extended-height professional graphics board with 96 GB of GDDR7 and a double flow-through cooler.', purpose: 'Single-GPU workstations for AI, rendering and simulation.',
    industries: ['Design & visualisation', 'AI development'],
    specs: [
      { label: 'Memory', spec: s<string>('96 GB GDDR7 with ECC', 'verified', 'nv-rtx-pro-6000-ws-ds') },
      { label: 'Total board power', spec: s<number>(600, 'verified', 'nv-rtx-pro-6000-ws-ds'), unit: 'W' },
      { label: 'Thermal solution', spec: s<string>('Double flow-through', 'verified', 'nv-rtx-pro-6000-ws-ds') },
      { label: 'Display outputs', spec: s<string>('4 × DisplayPort 2.1b', 'verified', 'nv-rtx-pro-6000-ws-ds') },
    ],
    physicalAssetId: 'pa-rtx-pro-6000-ws', related: ['nv-rtx-pro-6000-maxq', 'nv-rtx-pro-5000'], tags: ['gpu', 'card', 'pcie', 'rtx pro', 'blackwell', 'workstation'], sources: ['nv-rtx-pro-6000-ws-ds'],
  }),
  model({
    id: 'nv-rtx-pro-5000', familyId: 'fam-rtx-pro', name: 'NVIDIA RTX PRO 5000 Blackwell', manufacturer: 'NVIDIA', kind: 'board', status: 'shipping',
    description: 'A dual-slot, full-height professional graphics board with 48 GB of GDDR7.', purpose: 'Professional workstations for design, AI and simulation.',
    industries: ['Design & visualisation', 'AI development'],
    specs: [
      { label: 'Memory', spec: s<string>('48 GB GDDR7 with ECC', 'verified', 'nv-rtx-pro-5000-ds') },
      { label: 'Total board power', spec: s<number>(300, 'verified', 'nv-rtx-pro-5000-ds'), unit: 'W' },
      { label: 'Display outputs', spec: s<string>('4 × DisplayPort 2.1b', 'verified', 'nv-rtx-pro-5000-ds') },
    ],
    physicalAssetId: 'pa-rtx-pro-5000', related: ['nv-rtx-pro-6000-ws', 'nv-rtx-pro-6000-maxq'], tags: ['gpu', 'card', 'pcie', 'rtx pro', 'blackwell', 'workstation'], sources: ['nv-rtx-pro-5000-ds'],
  }),

  // ── RTX PRO Servers ──
  model({
    id: 'nv-rtx-pro-server', familyId: 'fam-rtx-pro-server', name: 'NVIDIA RTX PRO Server', manufacturer: 'NVIDIA', kind: 'reference-architecture', status: 'shipping',
    description: 'A server platform for enterprise and industrial AI, built by system partners. The flagship configuration carries eight RTX PRO 6000 Blackwell Server Edition GPUs.',
    purpose: 'Enterprise AI factories in existing data centers.', industries: ['Enterprise AI', 'Industrial AI'],
    specs: [
      { label: 'GPUs', spec: s<string>('8 × RTX PRO 6000 Blackwell Server Edition (4U and 6U); 2-GPU 2U configurations also listed', 'verified', 'nv-rtx-pro-server') },
      { label: 'Form factors', spec: s<string>('2U, 4U and 6U', 'verified', 'nv-rtx-pro-server') },
    ],
    implementations: ['dell-rtx-pro-server', 'hpe-rtx-pro-server'], related: ['nv-rtx-pro-6000-ws'], tags: ['rtx pro', 'server', 'enterprise', 'blackwell'], sources: ['nv-rtx-pro-server'],
  }),
  model({
    id: 'dell-rtx-pro-server', familyId: 'fam-rtx-pro-server', name: 'Dell PowerEdge R7725', manufacturer: 'Dell Technologies', kind: 'system', status: 'shipping',
    description: 'A 2U Dell PowerEdge server that takes RTX PRO 6000 Blackwell Server Edition GPUs. Recorded as the likely Dell RTX PRO Server; that match is a best judgement, not a Dell or NVIDIA statement.',
    purpose: 'A likely physical implementation of a 2U RTX PRO Server.', industries: ['Enterprise AI'],
    specs: [
      { label: 'RTX PRO Server role', spec: s<string>('2U RTX PRO Server', 'estimated', undefined, 'best judgement from the 2U RTX PRO Server configurations NVIDIA lists; to confirm') },
      { label: 'Depth to rear wall', spec: s<number>(700.7, 'verified', 'dell-r7725-ism', 'Zb: ear to rear wall'), unit: 'mm' },
    ],
    physicalAssetId: 'pa-dell-rtx-pro-server', related: ['nv-rtx-pro-server'], tags: ['rtx pro', 'server', 'dell', 'poweredge', 'r7725', '2u'], sources: ['dell-r7725-ism', 'nv-rtx-pro-server'],
  }),
  model({
    id: 'hpe-rtx-pro-server', familyId: 'fam-rtx-pro-server', name: 'HPE ProLiant Compute DL380a Gen12', manufacturer: 'Hewlett Packard Enterprise', kind: 'system', status: 'shipping',
    description: 'A 4U HPE ProLiant server for up to eight double-wide GPUs, including RTX PRO 6000 Blackwell Server Edition. Recorded as the likely HPE RTX PRO Server. Its dimensions come from a review until HPE QuickSpecs are read.',
    purpose: 'A likely physical implementation of a 4U, eight-GPU RTX PRO Server.', industries: ['Enterprise AI'],
    specs: [
      { label: 'Form factor', spec: s<string>('4U rack', 'verified', 'hpe-dl380a-qs') },
      { label: 'RTX PRO 6000 GPUs', spec: s<string>('up to 8', 'verified', 'hpe-dl380a-qs') },
      { label: 'RTX PRO Server role', spec: s<string>('4U, 8-GPU RTX PRO Server', 'estimated', undefined, 'best judgement; to confirm') },
    ],
    physicalAssetId: 'pa-hpe-rtx-pro-server', related: ['nv-rtx-pro-server'], tags: ['rtx pro', 'server', 'hpe', 'proliant', 'dl380a', '4u'], sources: ['hpe-dl380a-qs', 'sr-dl380a-gen12', 'nv-rtx-pro-server'],
  }),

  // ── Aerial RAN Computer ──
  model({
    id: 'nv-arc-pro', familyId: 'fam-aerial', name: 'NVIDIA Aerial RAN Computer Pro (ARC-Pro)', manufacturer: 'NVIDIA', kind: 'reference-architecture', status: 'shipping',
    description: 'An AI-RAN system in a telco-optimised MGX 2U Short form factor, built by partners including Cisco, Dell, HPE, Lanner, QCT and Supermicro.',
    purpose: 'Running radio access network and AI workloads on one accelerated platform.', industries: ['Telecommunications'],
    specs: [{ label: 'Form factor', spec: s<string>('MGX 2U Short', 'verified', 'nv-arc-family') }],
    implementations: ['qct-arc-pro-2u'], tags: ['aerial', 'ai-ran', 'arc', 'telco', 'mgx', '2u'], sources: ['nv-arc-family'],
  }),
  model({
    id: 'qct-arc-pro-2u', familyId: 'fam-aerial', name: 'QCT QuantaEdge EGN77C-2U', manufacturer: 'Quanta Cloud Technology', kind: 'system', status: 'shipping',
    description: `QCT’s 2U2N AI-RAN server for NVIDIA ARC-Pro, with a Grace CPU and an RTX PRO GPU. Recorded as the likely QCT ARC-Pro system (best judgement). ${NOT_PUBLISHED}`,
    purpose: 'A likely physical implementation of ARC-Pro.', industries: ['Telecommunications'],
    specs: [
      { label: 'Form factor', spec: s<string>('2U2N', 'verified', 'qct-egn77c') },
      { label: 'Platform', spec: s<string>('NVIDIA ARC-Pro: Grace CPU, RTX PRO GPU', 'verified', 'qct-egn77c') },
    ],
    physicalAssetId: 'pa-qct-arc-pro-2u', related: ['nv-arc-pro'], tags: ['aerial', 'ai-ran', 'arc-pro', 'qct', 'quanta', 'quantaedge', '2u'], sources: ['qct-egn77c', 'nv-arc-family'],
  }),

  // ── Spectrum-X Ethernet ──
  ...([
    ['nv-sn6600', 'NVIDIA Spectrum-X SN6600 Ethernet switch', 'Air-cooled Spectrum-6 switch for a 19-inch EIA rack.', '128 × 800 Gb/s OSFP', '200–240 VAC; air cooled', '19-inch EIA rack', 'shipping'],
    ['nv-sn6600-ld', 'NVIDIA Spectrum-X SN6600-LD Ethernet switch', 'Liquid-cooled Spectrum-6 switch for the 19-inch MGX rack.', '128 × 800 Gb/s OSFP', '48 VDC busbar (40–60 VDC); liquid cooled', '19-inch MGX v1.2 rack', 'announced'],
    ['nv-sn6810-ld', 'NVIDIA Spectrum-X SN6810-LD Ethernet Photonics switch', 'Liquid-cooled co-packaged-optics Spectrum-6 switch with MMC-16 fibre connectors.', '128 × 800 Gb/s MMC-16', '48 VDC busbar (40–60 VDC); liquid cooled', '19-inch MGX v1.2 rack', 'announced'],
    ['nv-sn6800-ld', 'NVIDIA Spectrum-X SN6800-LD Ethernet Photonics switch', 'Liquid-cooled co-packaged-optics Spectrum-6 switch with 2,048 ports of 200 Gb/s.', '2048 × 200 Gb/s MMC-16', '48 VDC busbar (40–60 VDC); liquid cooled', '19-inch MGX v1.2 rack', 'announced'],
  ] as const).map(([id, name, description, ports, power, mount, status]) => model({
    id, familyId: 'fam-spectrum-x', name, manufacturer: 'NVIDIA', kind: 'system', status, description,
    purpose: 'Scale-out Ethernet fabric for AI factories.',
    specs: [
      { label: 'Ports', spec: s<string>(ports, 'verified', 'nv-sn6000-hw') },
      { label: 'Power and cooling', spec: s<string>(power, 'verified', 'nv-sn6000-hw') },
      { label: 'Mounting', spec: s<string>(mount, 'verified', 'nv-sn6000-hw') },
    ],
    physicalAssetId: `pa-${id}`, related: ['nv-spectrum6-spx-rack', 'nv-spectrum-x-photonics'],
    tags: ['switch', 'ethernet', 'spectrum-x', 'spectrum-6', 'networking', ...(id.endsWith('-ld') ? ['liquid cooled', 'mgx'] : ['air cooled']), ...(id === 'nv-sn6600' || id === 'nv-sn6600-ld' ? [] : ['photonics', 'cpo'])],
    sources: ['nv-sn6000-hw'],
  })),
  model({
    id: 'nv-spectrum-x-photonics', familyId: 'fam-spectrum-x', name: 'NVIDIA Spectrum-X Ethernet Photonics', manufacturer: 'NVIDIA', kind: 'component', status: 'announced',
    description: `Switch silicon with co-packaged optics: the photonics sit on the same package as the switch ASIC instead of in pluggable transceivers. ${NOT_PUBLISHED}`,
    purpose: 'Power-efficient optical networking for very large AI factories.',
    specs: [
      { label: 'Bandwidth', spec: s<string>('up to 409.6 Tb/s', 'verified', 'nv-silicon-photonics') },
      { label: 'SerDes', spec: s<string>('200G', 'verified', 'nv-silicon-photonics') },
    ],
    physicalAssetId: 'pa-nv-spectrum-x-photonics', related: ['nv-sn6800-ld', 'nv-sn6810-ld'], tags: ['photonics', 'cpo', 'co-packaged optics', 'silicon', 'spectrum-x', 'networking'], sources: ['nv-silicon-photonics'],
  }),
  model({
    id: 'nv-spectrum6-spx-rack', familyId: 'fam-spectrum-x', name: 'NVIDIA Spectrum-6 SPX rack', manufacturer: 'NVIDIA', kind: 'rack', status: 'announced',
    description: `The networking rack of the Vera Rubin POD, configurable with Spectrum-X Ethernet or Quantum-X800 InfiniBand switches. ${NOT_PUBLISHED}`,
    purpose: 'Scale-out networking for a Vera Rubin POD.',
    specs: [
      { label: 'Switch', spec: s<string>('Spectrum-6, 102.4 Tb/s, 512 lanes', 'verified', 'nv-vr-pod-blog') },
      { label: 'Configurations', spec: s<string>('Spectrum-X Ethernet or Quantum-X800 InfiniBand switches', 'verified', 'nv-vr-pod-blog') },
    ],
    physicalAssetId: 'pa-nv-spectrum6-spx-rack', related: ['nv-sn6600-ld', 'nv-sn6800-ld', 'nv-sn6810-ld'], tags: ['rack', 'networking', 'spectrum-6', 'spx', 'vera rubin pod'], sources: ['nv-vr-pod-blog'],
  }),

  // ── SuperNICs and DPUs ──
  model({
    id: 'nv-connectx-9', familyId: 'fam-supernic-dpu', name: 'NVIDIA ConnectX-9 SuperNIC (C9180, PCIe)', manufacturer: 'NVIDIA', kind: 'board', status: 'shipping',
    description: 'Half-height, half-length PCIe SuperNIC with one OSFP cage for up to 800 Gb/s Ethernet or XDR InfiniBand. Other ConnectX-9 variants have dual QSFP112 ports and slightly different heights.',
    purpose: 'GPU-to-GPU networking in AI factories.',
    specs: [
      { label: 'Network port', spec: s<string>('1 × OSFP (riding heatsink cage)', 'verified', 'nv-cx9-hw') },
      { label: 'Data rate', spec: s<string>('800/400/200/100 Gb/s Ethernet; XDR/NDR InfiniBand', 'verified', 'nv-cx9-hw') },
      { label: 'Host interface', spec: s<string>('PCIe Gen6 x16 (Gen5 compatible)', 'verified', 'nv-cx9-hw') },
    ],
    physicalAssetId: 'pa-nv-connectx-9', related: ['nv-bluefield-4'], tags: ['supernic', 'nic', 'connectx', 'connectx-9', 'networking', 'card', 'pcie'], sources: ['nv-cx9-hw'],
  }),
  model({
    id: 'nv-bluefield-4', familyId: 'fam-supernic-dpu', name: 'NVIDIA BlueField-4 DPU', manufacturer: 'NVIDIA', kind: 'board', status: 'announced',
    description: `A data processing unit combining a Vera CPU with a ConnectX-9 SuperNIC. The datasheet PDF could not be read, so the board’s form factor is not recorded. ${NOT_PUBLISHED}`,
    purpose: 'Offloading networking, storage and security from the host.',
    specs: [
      { label: 'Throughput', spec: s<string>('up to 800 Gb/s', 'verified', 'nv-bf4-ds') },
      { label: 'Composition', spec: s<string>('Vera CPU + ConnectX-9 SuperNIC', 'verified', 'nv-vr-pod-blog') },
    ],
    physicalAssetId: 'pa-nv-bluefield-4', related: ['nv-connectx-9', 'nv-bf4-stx-rack'], tags: ['dpu', 'bluefield', 'bluefield-4', 'networking', 'storage', 'security'], sources: ['nv-bf4-ds', 'nv-vr-pod-blog'],
  }),

  // ── BlueField-4 STX and CMX ──
  model({
    id: 'nv-bf4-stx-rack', familyId: 'fam-ai-storage', name: 'NVIDIA BlueField-4 STX storage rack', manufacturer: 'NVIDIA', kind: 'rack', status: 'announced',
    description: `The storage rack of the Vera Rubin POD, built on the MGX ETL rack with a Spectrum-X spine. It hosts the CMX context memory storage platform. ${NOT_PUBLISHED}`,
    purpose: 'AI-native storage and context memory for agentic AI.',
    specs: [
      { label: 'Rack', spec: s<string>('MGX ETL with Spectrum-X Ethernet spine', 'verified', 'nv-vr-pod-blog') },
      { label: 'Processor', spec: s<string>('BlueField-4 (Vera CPU + ConnectX-9 SuperNIC)', 'verified', 'nv-vr-pod-blog') },
    ],
    physicalAssetId: 'pa-nv-bf4-stx-rack', related: ['nv-bf4-stx-processor', 'nv-cmx', 'nv-bluefield-4'], tags: ['rack', 'storage', 'bluefield-4', 'stx', 'cmx', 'vera rubin pod'], sources: ['nv-vr-pod-blog'],
  }),
  model({
    id: 'nv-bf4-stx-processor', familyId: 'fam-ai-storage', name: 'NVIDIA BlueField-4 STX storage processor', manufacturer: 'NVIDIA', kind: 'system', status: 'announced',
    description: `A purpose-built, Vera-based storage processor that powers AI storage platforms and manages NVMe SSDs. ${NOT_PUBLISHED}`,
    purpose: 'The building block of BlueField-4 STX storage.',
    specs: [{ label: 'Basis', spec: s<string>('NVIDIA Vera-based storage processor', 'verified', 'nv-cmx') }],
    physicalAssetId: 'pa-nv-bf4-stx-processor', related: ['nv-bf4-stx-rack', 'nv-cmx'], tags: ['storage', 'bluefield-4', 'stx', 'nvme'], sources: ['nv-cmx'],
  }),
  model({
    id: 'nv-cmx', familyId: 'fam-ai-storage', name: 'NVIDIA CMX context memory storage platform', manufacturer: 'NVIDIA', kind: 'reference-architecture', status: 'announced',
    description: 'A storage platform for AI context memory, powered by the BlueField-4 storage processor over Spectrum-X Ethernet. Partners build the physical systems.',
    purpose: 'Context memory storage for AI inference.',
    specs: [{ label: 'Powered by', spec: s<string>('BlueField-4 storage processor; Spectrum-X Ethernet RDMA fabric', 'verified', 'nv-cmx') }],
    implementations: ['qct-vera-cmx', 'smc-vera-cmx'], related: ['nv-bf4-stx-rack', 'nv-bf4-stx-processor'], tags: ['cmx', 'storage', 'context memory', 'inference'], sources: ['nv-cmx'],
  }),
  model({
    id: 'qct-vera-cmx', familyId: 'fam-ai-storage', name: 'Quanta Vera CMX storage system', manufacturer: 'Quanta Cloud Technology', kind: 'system', status: 'announced',
    description: `A partner CMX system from Quanta; no model number is published yet. ${NOT_PUBLISHED}`,
    purpose: 'One physical implementation of CMX.', physicalAssetId: 'pa-qct-vera-cmx', related: ['nv-cmx'], tags: ['cmx', 'storage', 'quanta', 'qct', 'vera'], sources: ['nv-cmx'],
  }),
  model({
    id: 'smc-vera-cmx', familyId: 'fam-ai-storage', name: 'Supermicro Vera CMX storage system', manufacturer: 'Supermicro', kind: 'system', status: 'announced',
    description: `A partner CMX system from Supermicro, named on NVIDIA’s CMX page; no model number is published yet. ${NOT_PUBLISHED}`,
    purpose: 'One physical implementation of CMX.', physicalAssetId: 'pa-smc-vera-cmx', related: ['nv-cmx'], tags: ['cmx', 'storage', 'supermicro', 'vera'], sources: ['nv-cmx'],
  }),

  // ── Groq 3 LPX ──
  model({
    id: 'nv-groq3-lpx-rack', familyId: 'fam-groq-lpx', name: 'NVIDIA Groq 3 LPX rack', manufacturer: 'NVIDIA', kind: 'rack', status: 'announced',
    description: `A rack-scale inference system of 256 language processing units on the MGX ETL rack, joined by a direct chip-to-chip copper spine. ${NOT_PUBLISHED}`,
    purpose: 'Inference in a Vera Rubin POD.',
    specs: [
      { label: 'LPUs', spec: s<string>('256 per rack', 'verified', 'nv-vr-pod-blog') },
      { label: 'Compute trays', spec: s<string>('32, each with 8 LPUs', 'verified', 'nv-vr-pod-blog') },
      { label: 'Spine', spec: s<string>('MGX ETL direct chip-to-chip spine, 2 copper cable cartridges', 'verified', 'nv-vr-pod-blog') },
    ],
    physicalAssetId: 'pa-nv-groq3-lpx-rack', related: ['nv-groq3-lpx-tray'], tags: ['rack', 'groq', 'lpx', 'lpu', 'inference', 'vera rubin pod'], sources: ['nv-vr-pod-blog'],
  }),
  model({
    id: 'nv-groq3-lpx-tray', familyId: 'fam-groq-lpx', name: 'NVIDIA Groq 3 LPX compute tray', manufacturer: 'NVIDIA', kind: 'tray', status: 'announced',
    description: `One of the 32 compute trays of a Groq 3 LPX rack. ${NOT_PUBLISHED}`, purpose: 'The compute building block of Groq 3 LPX.',
    specs: [{ label: 'LPUs', spec: s<string>('8 per tray', 'verified', 'nv-vr-pod-blog') }],
    physicalAssetId: 'pa-nv-groq3-lpx-tray', related: ['nv-groq3-lpx-rack'], tags: ['tray', 'groq', 'lpx', 'lpu'], sources: ['nv-vr-pod-blog'],
  }),

  // ── Vera Rubin NVL72 and NVL576 ──
  model({
    id: 'nv-dgx-vr-nvl72', familyId: 'fam-nvl-rack', name: 'NVIDIA DGX Vera Rubin NVL72 rack', manufacturer: 'NVIDIA', kind: 'rack', status: 'announced',
    description: `The physical Vera Rubin NVL72 rack: a single-wide, third-generation MGX rack with 18 compute trays and 9 NVLink switch trays. ${NOT_PUBLISHED}`,
    purpose: 'One physical implementation of Vera Rubin NVL72.',
    specs: [
      { label: 'Rack', spec: s<string>('Single-wide third-generation NVIDIA MGX', 'verified', 'nv-vr-pod-blog') },
      { label: 'Trays', spec: s<string>('18 compute trays, 9 NVLink switch trays', 'verified', 'nv-vr-pod-blog') },
      { label: 'Cooling', spec: s<string>('Liquid cooled; 45 °C warm-water inlet', 'verified', 'nv-vr-pod-blog') },
    ],
    physicalAssetId: 'pa-nv-dgx-vr-nvl72', related: ['nv-vera-rubin-nvl72', 'nv-vr-nvl72-compute-tray', 'nv-vr-nvlink-switch-tray'], tags: ['rack', 'nvl72', 'vera rubin', 'rubin', 'dgx', 'mgx', 'liquid cooled'], sources: ['nv-vr-pod-blog'],
  }),
  model({
    id: 'nv-vr-nvl72-compute-tray', familyId: 'fam-nvl-rack', name: 'NVIDIA Vera Rubin NVL72 compute tray', manufacturer: 'NVIDIA', kind: 'tray', status: 'announced',
    description: `One of the 18 compute trays of a Vera Rubin NVL72 rack. ${NOT_PUBLISHED}`, purpose: 'The compute building block of Vera Rubin NVL72.',
    specs: [{ label: 'Superchips', spec: s<string>('2 × Vera Rubin superchip', 'verified', 'nv-vr-pod-blog') }],
    physicalAssetId: 'pa-nv-vr-nvl72-compute-tray', related: ['nv-dgx-vr-nvl72', 'nv-vr-nvlink-switch-tray'], tags: ['tray', 'compute tray', 'nvl72', 'vera rubin'], sources: ['nv-vr-pod-blog'],
  }),
  model({
    id: 'nv-vr-nvlink-switch-tray', familyId: 'fam-nvl-rack', name: 'NVIDIA Vera Rubin NVL72 NVLink switch tray', manufacturer: 'NVIDIA', kind: 'tray', status: 'announced',
    description: `One of the 9 NVLink switch trays of a Vera Rubin NVL72 rack. ${NOT_PUBLISHED}`, purpose: 'Joins the rack’s GPUs into one NVLink domain.',
    physicalAssetId: 'pa-nv-vr-nvlink-switch-tray', related: ['nv-dgx-vr-nvl72', 'nv-vr-nvl72-compute-tray'], tags: ['tray', 'switch tray', 'nvlink', 'nvl72', 'vera rubin'], sources: ['nv-vr-pod-blog'],
  }),
  model({
    id: 'nv-vr-ultra-nvl576', familyId: 'fam-nvl-rack', name: 'NVIDIA Vera Rubin Ultra NVL576', manufacturer: 'NVIDIA', kind: 'reference-architecture', status: 'announced',
    description: 'A future NVLink domain of 576 Rubin Ultra GPUs. NVIDIA describes it as combining eight MGX NVL racks of 72 Rubin Ultra GPUs each; no rack or tray dimensions are published.',
    purpose: 'Next-generation rack-scale AI factory compute.',
    specs: [{ label: 'Composition', spec: s<string>('8 MGX NVL racks, each with 72 Rubin Ultra GPUs', 'verified', 'nv-vr-pod-blog') }],
    implementations: [], related: ['nv-vr-ultra-compute-tray', 'nv-vr-ultra-switch-tray', 'nv-vera-rubin-nvl72'], tags: ['rack', 'nvl576', 'rubin ultra', 'vera rubin', 'kyber'], sources: ['nv-vr-pod-blog'],
  }),
  model({
    id: 'nv-vr-ultra-compute-tray', familyId: 'fam-nvl-rack', name: 'NVIDIA Vera Rubin Ultra compute tray', manufacturer: 'NVIDIA', kind: 'tray', status: 'announced',
    description: `The compute tray of the Vera Rubin Ultra generation. ${NOT_PUBLISHED}`, purpose: 'The compute building block of Vera Rubin Ultra NVL576.',
    physicalAssetId: 'pa-nv-vr-ultra-compute-tray', related: ['nv-vr-ultra-nvl576', 'nv-vr-ultra-switch-tray'], tags: ['tray', 'compute tray', 'rubin ultra', 'nvl576'], sources: ['nv-vr-pod-blog'],
  }),
  model({
    id: 'nv-vr-ultra-switch-tray', familyId: 'fam-nvl-rack', name: 'NVIDIA Vera Rubin Ultra NVLink switch tray', manufacturer: 'NVIDIA', kind: 'tray', status: 'announced',
    description: `The NVLink switch tray of the Vera Rubin Ultra generation. ${NOT_PUBLISHED}`, purpose: 'Joins Rubin Ultra GPUs into one NVLink domain.',
    physicalAssetId: 'pa-nv-vr-ultra-switch-tray', related: ['nv-vr-ultra-nvl576', 'nv-vr-ultra-compute-tray'], tags: ['tray', 'switch tray', 'nvlink', 'rubin ultra', 'nvl576'], sources: ['nv-vr-pod-blog'],
  }),

  // ── Vera CPU ──
  model({
    id: 'nv-vera-cpu-rack', familyId: 'fam-vera-cpu', name: 'NVIDIA Vera CPU rack', manufacturer: 'NVIDIA', kind: 'rack', status: 'announced',
    description: `A dense, liquid-cooled rack of up to 256 Vera CPUs on the MGX ETL rack with a Spectrum-X Ethernet spine. ${NOT_PUBLISHED}`,
    purpose: 'CPU compute in a Vera Rubin POD.',
    specs: [
      { label: 'CPUs', spec: s<string>('up to 256 NVIDIA Vera CPUs', 'verified', 'nv-vr-pod-blog') },
      { label: 'Rack', spec: s<string>('MGX ETL with Spectrum-X Ethernet spine; liquid cooled', 'verified', 'nv-vr-pod-blog') },
    ],
    physicalAssetId: 'pa-nv-vera-cpu-rack', related: ['nv-vera-cpu-tray'], tags: ['rack', 'cpu', 'vera', 'vera rubin pod', 'liquid cooled'], sources: ['nv-vr-pod-blog'],
  }),
  model({
    id: 'nv-vera-cpu-tray', familyId: 'fam-vera-cpu', name: 'NVIDIA Vera CPU compute tray', manufacturer: 'NVIDIA', kind: 'tray', status: 'announced',
    description: `The compute tray of the Vera CPU rack. The number of CPUs per tray is not published. ${NOT_PUBLISHED}`, purpose: 'The building block of the Vera CPU rack.',
    physicalAssetId: 'pa-nv-vera-cpu-tray', related: ['nv-vera-cpu-rack'], tags: ['tray', 'cpu', 'vera'], sources: ['nv-vr-pod-blog'],
  }),
];

const GEN = 'Generated proxy at the published envelope.';

export const LINEUP_PHYSICAL: PhysicalAsset[] = [
  {
    id: 'pa-dell-pro-max-gb300', modelId: 'dell-pro-max-gb300',
    dims: dims(s(231.6, 'verified', 'dell-pro-max-gb300'), s(610.5, 'verified', 'dell-pro-max-gb300'), s(569, 'verified', 'dell-pro-max-gb300')),
    weightKg: s(38.67, 'verified', 'dell-pro-max-gb300', 'maximum'),
    interfaces: [{ name: 'C19 power inlet', side: 'rear', status: 'verified', sourceId: 'dell-pro-max-gb300' }],
    digitalAssets: [proxy('da-dell-pro-max-gb300-proxy', 1, `Tower with front intake field and rear I/O band. ${GEN}`)],
  },
  {
    id: 'pa-gb-w775-v10', modelId: 'gb-w775-v10',
    dims: dims(s(245, 'verified', 'gb-w775'), s(531, 'verified', 'gb-w775'), s(500.4, 'verified', 'gb-w775')),
    weightKg: s(29.2, 'verified', 'gb-w775', 'net'),
    interfaces: [
      { name: 'USB-C, 2 × USB-A, audio, power and reset buttons', side: 'front', status: 'verified', sourceId: 'gb-w775' },
      { name: '4 × USB-A, Mini-DP, 2 × QSFP, RJ45, MLAN, audio', side: 'rear', status: 'verified', sourceId: 'gb-w775' },
    ],
    digitalAssets: [proxy('da-gb-w775-proxy', 1, `Pedestal with front intake field and rear I/O band. ${GEN}`)],
  },
  { ...unknown('pa-hp-zgx-fury-g1n', 'hp-zgx-fury-g1n'), interfaces: [{ name: 'C20 AC inlet, 2 × QSFP112, RJ-45 10 Gbps, BMC ports', side: 'rear', status: 'verified', sourceId: 'hp-zgx-fury' }] },
  {
    id: 'pa-msi-ws300', modelId: 'msi-ws300',
    dims: dims(s(245.7, 'verified', 'msi-ws300'), s(570.4, 'verified', 'msi-ws300'), s(529, 'verified', 'msi-ws300')),
    interfaces: [{ name: '2 × QSFP 400 GbE, 1 × RJ45 10 GbE', side: 'rear', status: 'verified', sourceId: 'msi-ws300' }],
    digitalAssets: [proxy('da-msi-ws300-proxy', 1, `Tower with front intake field and rear I/O band. ${GEN}`)],
  },
  {
    id: 'pa-smc-ars-511gd', modelId: 'smc-ars-511gd',
    dims: dims(
      s(454.7, 'verified', 'smc-ars-511gd', 'enclosure as listed (W × H × D), which is the 5U rack orientation; stood as a tower, width and height swap'),
      s(701, 'verified', 'smc-ars-511gd'),
      s(218.4, 'verified', 'smc-ars-511gd', 'enclosure as listed; the 5U rack orientation'),
    ),
    weightKg: s(40, 'verified', 'smc-ars-511gd', 'net'),
    interfaces: [
      { name: '2 × USB 3.0 Type-A', side: 'front', status: 'verified', sourceId: 'smc-ars-511gd' },
      { name: '2 × QSFP 400 GbE (ConnectX-8)', side: 'rear', status: 'verified', sourceId: 'smc-ars-511gd' },
    ],
    digitalAssets: [proxy('da-smc-ars-511gd-proxy', 1, `Chassis lying in its 5U rack orientation. ${GEN}`)],
  },
  {
    id: 'pa-rtx-pro-6000-ws', modelId: 'nv-rtx-pro-6000-ws',
    dims: dims(
      s(12 * IN, 'verified', 'nv-rtx-pro-6000-ws-ds', 'board length 12 in'),
      s(DUAL_SLOT, 'estimated', undefined, 'dual slot: two 20.32 mm PCIe slot pitches; the datasheet states “dual slot” without a thickness'),
      s(5.4 * IN, 'verified', 'nv-rtx-pro-6000-ws-ds', 'board height 5.4 in, extended height'),
    ),
    interfaces: [
      { name: '4 × DisplayPort 2.1b', side: 'left', status: 'verified', sourceId: 'nv-rtx-pro-6000-ws-ds' },
      { name: 'PCIe CEM5 16-pin power', side: 'top', status: 'verified', sourceId: 'nv-rtx-pro-6000-ws-ds' },
    ],
    digitalAssets: [proxy('da-rtx-pro-6000-ws-proxy', 1, 'Board shown upright as installed: shroud, two flow-through fans, bracket and PCIe edge, at the stated length and height.')],
  },
  {
    id: 'pa-rtx-pro-5000', modelId: 'nv-rtx-pro-5000',
    dims: dims(
      s(10.5 * IN, 'verified', 'nv-rtx-pro-5000-ds', 'board length 10.5 in'),
      s(DUAL_SLOT, 'estimated', undefined, 'dual slot: two 20.32 mm PCIe slot pitches; the datasheet states “dual slot” without a thickness'),
      s(4.4 * IN, 'verified', 'nv-rtx-pro-5000-ds', 'board height 4.4 in, full height'),
    ),
    interfaces: [
      { name: '4 × DisplayPort 2.1b', side: 'left', status: 'verified', sourceId: 'nv-rtx-pro-5000-ds' },
      { name: 'PCIe CEM5 16-pin power', side: 'top', status: 'verified', sourceId: 'nv-rtx-pro-5000-ds' },
    ],
    digitalAssets: [proxy('da-rtx-pro-5000-proxy', 1, 'Board shown upright as installed: shroud, blower intake, bracket and PCIe edge, at the stated length and height.')],
  },
  {
    id: 'pa-dell-rtx-pro-server', modelId: 'dell-rtx-pro-server',
    dims: dims(
      s(482, 'verified', 'dell-r7725-ism', 'Xa: across the rack ears'),
      s(802.4, 'estimated', 'dell-r7725-ism', 'derived: Za 30.78 (bezel) + Zc 771.62 (ear to PSU handle)'),
      s(86.8, 'verified', 'dell-r7725-ism'),
    ),
    rackUnits: s(2, 'estimated', undefined, 'derived from the 86.8 mm height'),
    interfaces: [],
    digitalAssets: [proxy('da-dell-r7725-proxy', 1, `2U chassis between rack ears with a front drive field. ${GEN}`)],
  },
  {
    id: 'pa-hpe-rtx-pro-server', modelId: 'hpe-rtx-pro-server',
    dims: dims(
      s(447.8, 'estimated', 'sr-dl380a-gen12', 'review lists 6.88 × 17.63 × 31.60, read as inches H × W × D'),
      s(802.6, 'estimated', 'sr-dl380a-gen12', 'review lists 6.88 × 17.63 × 31.60, read as inches H × W × D'),
      s(174.8, 'estimated', 'sr-dl380a-gen12', 'review lists 6.88 × 17.63 × 31.60, read as inches H × W × D'),
    ),
    rackUnits: s(4, 'verified', 'hpe-dl380a-qs'),
    interfaces: [],
    digitalAssets: [proxy('da-hpe-dl380a-proxy', 1, `4U chassis with a front intake field. ${GEN}`)],
  },
  unknown('pa-qct-arc-pro-2u', 'qct-arc-pro-2u'),
  ...([
    ['nv-sn6600', 438, 767, 133.35, 52, 'EIA'],
    ['nv-sn6600-ld', 438, 900, 88, 33, 'MGX'],
    ['nv-sn6810-ld', 438, 900, 87, 32.5, 'MGX'],
    ['nv-sn6800-ld', 438, 900, 220, 95, 'MGX'],
  ] as const).map(([id, w, d, h, kg, rack]): PhysicalAsset => ({
    id: `pa-${id}`, modelId: id,
    dims: dims(s(w, 'verified', 'nv-sn6000-hw'), s(d, 'verified', 'nv-sn6000-hw'), s(h, 'verified', 'nv-sn6000-hw')),
    weightKg: s(kg, 'verified', 'nv-sn6000-hw'),
    ...(rack === 'EIA' ? { rackUnits: s(3, 'estimated', undefined, 'derived: 133.35 mm is exactly 3 × 44.45 mm; the manual does not state a U height') } : {}),
    interfaces: [{ name: rack === 'EIA' ? '128 × OSFP' : id === 'nv-sn6600-ld' ? '128 × OSFP' : 'MMC-16 fibre connectors', side: 'front', status: 'estimated', note: 'the manual lists the ports; which face carries them is assumed' }],
    digitalAssets: [proxy(`da-${id}-proxy`, 1, `Switch chassis with a front port field${rack === 'EIA' ? ' and rack ears' : ''}. ${GEN}`)],
  })),
  unknown('pa-nv-spectrum-x-photonics', 'nv-spectrum-x-photonics'),
  unknown('pa-nv-spectrum6-spx-rack', 'nv-spectrum6-spx-rack'),
  {
    id: 'pa-nv-connectx-9', modelId: 'nv-connectx-9',
    dims: dims(
      s(168.4, 'verified', 'nv-cx9-hw', 'half length, 6.58 in'),
      s(20.32, 'estimated', undefined, 'one PCIe slot pitch; the manual gives no thickness or slot count'),
      s(68.5, 'verified', 'nv-cx9-hw', 'half height, 2.69 in'),
    ),
    interfaces: [{ name: '1 × OSFP cage', side: 'left', status: 'verified', sourceId: 'nv-cx9-hw' }],
    digitalAssets: [proxy('da-nv-connectx-9-proxy', 1, 'Half-height card shown upright: heatsink, OSFP cage at the bracket and PCIe edge.')],
  },
  unknown('pa-nv-bluefield-4', 'nv-bluefield-4'),
  unknown('pa-nv-bf4-stx-rack', 'nv-bf4-stx-rack'),
  unknown('pa-nv-bf4-stx-processor', 'nv-bf4-stx-processor'),
  unknown('pa-qct-vera-cmx', 'qct-vera-cmx'),
  unknown('pa-smc-vera-cmx', 'smc-vera-cmx'),
  unknown('pa-nv-groq3-lpx-rack', 'nv-groq3-lpx-rack'),
  unknown('pa-nv-groq3-lpx-tray', 'nv-groq3-lpx-tray'),
  { ...unknown('pa-nv-dgx-vr-nvl72', 'nv-dgx-vr-nvl72'), weightKg: s(1814, 'estimated', 'nv-vr-pod-blog', 'NVIDIA says “roughly 4,000 lbs”') },
  unknown('pa-nv-vr-nvl72-compute-tray', 'nv-vr-nvl72-compute-tray'),
  unknown('pa-nv-vr-nvlink-switch-tray', 'nv-vr-nvlink-switch-tray'),
  unknown('pa-nv-vr-ultra-compute-tray', 'nv-vr-ultra-compute-tray'),
  unknown('pa-nv-vr-ultra-switch-tray', 'nv-vr-ultra-switch-tray'),
  unknown('pa-nv-vera-cpu-rack', 'nv-vera-cpu-rack'),
  unknown('pa-nv-vera-cpu-tray', 'nv-vera-cpu-tray'),
];
