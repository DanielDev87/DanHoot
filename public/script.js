// Initialize socket connection
const socket = io();

// Shared SVG shapes representing choices (Kahoot identity)
const OptionIcons = [
  // Option 0 (Red Triangle)
  `<svg class="opt-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <polygon points="12,2 22,22 2,22" />
  </svg>`,
  // Option 1 (Blue Diamond)
  `<svg class="opt-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <polygon points="12,2 22,12 12,22 2,12" />
  </svg>`,
  // Option 2 (Navy Circle)
  `<svg class="opt-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" />
  </svg>`,
  // Option 3 (White Square)
  `<svg class="opt-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="3" width="18" height="18" rx="2" />
  </svg>`
];

/**
 * Reads query parameter from URL
 * @param {string} param Name of parameter
 * @returns {string|null} Value of parameter or null
 */
function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

/**
 * Formats scores nicely with commas
 * @param {number} num Number to format
 * @returns {string} Formatted number
 */
function formatNumber(num) {
  return new Intl.NumberFormat().format(num);
}
