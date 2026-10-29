import type { Survey } from './types'

// Public HiPS layers served by CDS. These are real survey images, but they
// are NOT SPHEREx data; the UI labels them as such.
export const SURVEYS: Survey[] = [
  {
    id: 'P/2MASS/color',
    name: '2MASS color',
    wavelength: 'Near-infrared J/H/Ks (1.2–2.2 µm)',
    description:
      'Two Micron All Sky Survey. Its near-infrared wavelengths overlap the short end of the SPHEREx range, so dust-hidden stars show up.',
    attribution:
      '2MASS: University of Massachusetts & IPAC/Caltech, funded by NASA and NSF. HiPS via CDS.',
    url: 'https://irsa.ipac.caltech.edu/Missions/2mass.html',
  },
  {
    id: 'P/DSS2/color',
    name: 'DSS2 color',
    wavelength: 'Visible (photographic blue/red plates)',
    description:
      'Digitized Sky Survey. A visible-light view of the sky, as your eye would see it with a large telescope.',
    attribution:
      'DSS2: STScI/AURA, based on photographic data from the Palomar and UK Schmidt telescopes. HiPS via CDS.',
    url: 'https://archive.stsci.edu/dss/',
  },
  {
    id: 'P/allWISE/color',
    name: 'AllWISE color',
    wavelength: 'Mid-infrared W1/W2/W4 (3.4–22 µm)',
    description:
      'Wide-field Infrared Survey Explorer. Its W1/W2 bands overlap the long end of the SPHEREx range; warm dust glows here.',
    attribution: 'WISE/NEOWISE: NASA/JPL-Caltech/UCLA. HiPS via CDS.',
    url: 'https://irsa.ipac.caltech.edu/Missions/wise.html',
  },
]

export const DEFAULT_SURVEY_ID = SURVEYS[0].id
