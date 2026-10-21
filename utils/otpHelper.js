// utils/otpHelper.js
export const generateOTP = () => {
  // Generate a random 6-digit numeric OTP as a string
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const getOtpExpiry = () => {
  const expiry = new Date();
  // OTP valid for 10 minutes (configurable via env if needed)
  expiry.setMinutes(expiry.getMinutes() + 10);
  return expiry;
};
