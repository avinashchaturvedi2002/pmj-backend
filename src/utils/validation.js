/**
 * Validate email format
 */
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate password strength
 * At least 8 characters, 1 uppercase, 1 lowercase, 1 number
 */
const isValidPassword = (password) => {
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
  return passwordRegex.test(password);
};

/**
 * Validate date format (YYYY-MM-DD or ISO string)
 */
const isValidDate = (date) => {
  const parsedDate = new Date(date);
  return !isNaN(parsedDate.getTime());
};

/**
 * Check if date is in future
 */
const isFutureDate = (date) => {
  return new Date(date) > new Date();
};

/**
 * Validate pagination parameters
 */
const validatePagination = (page, limit) => {
  const parsedPage = parseInt(page) || 1;
  const parsedLimit = parseInt(limit) || parseInt(process.env.DEFAULT_PAGE_SIZE) || 10;
  const maxLimit = parseInt(process.env.MAX_PAGE_SIZE) || 100;

  return {
    page: Math.max(1, parsedPage),
    limit: Math.min(maxLimit, Math.max(1, parsedLimit))
  };
};

module.exports = {
  isValidEmail,
  isValidPassword,
  isValidDate,
  isFutureDate,
  validatePagination
};


