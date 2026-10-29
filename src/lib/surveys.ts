import type { Survey } from './types'

// Public HiPS layers built by CDS. These are real survey images, but they
// are NOT SPHEREx data; the UI labels them as such. Tiles come from ESA's
// ESASky mirror of the CDS HiPS: it allows cross-origin use (WebGL needs
// that) and keeps the atlas working when the CDS servers are unreachable.
export const SURVEYS: Survey[] = [
  {
    id: 'P/2MASS/color',
    hipsUrl: 'https://skies.esac.esa.int/2MASSColor',
    name: '2MASS color',
    wavelength: 'Near-infrared J/H/Ks (1.2–2.2 µm)',
    description:
      'Two Micron All Sky Survey. Its near-infrared wavelengths overlap the short end of the SPHEREx range, so dust-hidden stars show up.',
    attribution:
      '2MASS: University of Massachusetts & IPAC/Caltech, funded by NASA and NSF. HiPS by CDS, mirrored by ESA ESASky.',
    url: 'https://irsa.ipac.caltech.edu/Missions/2mass.html',
  },
  {
    id: 'P/DSS2/color',
    hipsUrl: 'https://skies.esac.esa.int/DSSColor',
    name: 'DSS2 color',
    wavelength: 'Visible (photographic blue/red plates)',
    description:
      'Digitized Sky Survey. A visible-light view of the sky, as your eye would see it with a large telescope.',
    attribution:
      'DSS2: STScI/AURA, based on photographic data from the Palomar and UK Schmidt telescopes. HiPS by CDS, mirrored by ESA ESASky.',
    url: 'https://archive.stsci.edu/dss/',
  },
  {
    id: 'P/allWISE/color',
    hipsUrl: 'https://skies.esac.esa.int/AllWISEColor',
    name: 'AllWISE color',
    wavelength: 'Mid-infrared W1/W2/W4 (3.4–22 µm)',
    description:
      'Wide-field Infrared Survey Explorer. Its W1/W2 bands overlap the long end of the SPHEREx range; warm dust glows here.',
    attribution: 'WISE/NEOWISE: NASA/JPL-Caltech/UCLA. HiPS by CDS, mirrored by ESA ESASky.',
    url: 'https://irsa.ipac.caltech.edu/Missions/wise.html',
  },
]

export const DEFAULT_SURVEY_ID = SURVEYS[0].id
