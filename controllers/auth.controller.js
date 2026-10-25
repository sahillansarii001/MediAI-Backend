import User from "../models/User.js";
import Doctor from "../models/Doctor.js";
import Chat from "../models/Chat.js";
import { computeDoctorStatus } from "../utils/statusHelper.js";
import {
  generateAccessToken,
  generateRefreshToken,
} from "../utils/generateToken.js";
import crypto from "crypto";
import sendEmail from "../utils/sendEmail.js";
import Notification from "../models/Notification.js";
import { getFaceEmbedding } from "../services/faceRecognition.service.js";
import { encryptData } from "../utils/encryption.js";
import fs from "fs";
import cloudinary from "../config/cloudinary.js";

// Helper to upload a local multer file to Cloudinary and delete the local file
const uploadToCloudinary = async (file, folder = "avatars") => {
  if (!file || !file.path) return "";
  try {
    const result = await cloudinary.uploader.upload(file.path, {
      folder,
      resource_type: "auto",
    });
    try {
      fs.unlinkSync(file.path);
    } catch (_) {}
    return result.secure_url;
  } catch (err) {
    console.error(
      `Cloudinary upload failed for ${file.originalname}:`,
      err.message,
    );
    return file.filename; // fallback
  }
};
// Helper to generate OTP
const generateOtp = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

const getOtpTemplate = (otp) => `
<div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px;">
  <h2 style="color: #0d9488; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">MediAI Healthcare</h2>
  <p>Hello,</p>
  <p>We received a request to verify your email address. Your verification code is:</p>
  <div style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #0d9488; margin: 20px 0; padding: 15px; background: #f0fdfa; border-radius: 8px; text-align: center; border: 1px dashed #5eead4;">
    ${otp}
  </div>
  <p>This code will expire in 10 minutes. If you did not request this, you can safely ignore this email.</p>
  <br>
  <p style="color: #64748b; font-size: 14px;">Best regards,<br>The MediAI Team</p>
</div>
`;

// Helper to send token response
const sendTokenResponse = (user, statusCode, res, isDoctor = false) => {
  const token = generateAccessToken(user._id, user.role);
  const refreshToken = generateRefreshToken(user._id, user.role);

  const responseData = {
    success: true,
    _id: user._id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    mustChangePassword: user.mustChangePassword || false,
    token,
    refreshToken,
  };

  if (isDoctor) {
    responseData.verificationStatus = user.verificationStatus;
  }

  res.status(statusCode).json(responseData);
};

// @desc    Register a new user (Patient)
// @route   POST /api/auth/register
// @access  Public
export const registerPatient = async (req, res, next) => {
  try {
    let {
      fullName,
      email,
      password,
      age,
      sex,
      bloodGroup,
      allergies,
      currentMedications,
      previousDiseaseHistory,
      familyDiseaseHistory,
      emergencyContact,
      location,
    } = req.body;
    if (email) email = email.toLowerCase();

    if (typeof emergencyContact === "string") {
      try {
        emergencyContact = JSON.parse(emergencyContact);
      } catch (e) {}
    }

    let userExists = await User.findOne({ email });
    const doctorExists = await Doctor.findOne({ email });

    if (doctorExists) {
      return res
        .status(400)
        .json({ success: false, message: "Email already registered" });
    }

    const otp = generateOtp();
    const otpExpire = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    let user;
    if (userExists) {
      if (userExists.isVerified) {
        return res
          .status(400)
          .json({
            success: false,
            message: "Email already registered and verified",
          });
      }
      userExists.fullName = fullName;
      userExists.password = password;
      userExists.age = age;
      userExists.sex = sex;
      userExists.bloodGroup = bloodGroup;
      userExists.allergies = allergies;
      userExists.currentMedications = currentMedications;
      userExists.previousDiseaseHistory = previousDiseaseHistory;
      userExists.familyDiseaseHistory = familyDiseaseHistory;
      userExists.emergencyContact = emergencyContact;
      userExists.location = location;
      let embeddingString = null;
      let emergencyEnabled = false;

      let avatarUrl = "";
      let fileBuffer = null;
      if (req.file) {
        fileBuffer = fs.readFileSync(req.file.path);
        avatarUrl = await uploadToCloudinary(req.file, "avatars");
        userExists.avatar = avatarUrl;
      }

      if (embeddingString) {
        userExists.faceEmbedding = embeddingString;
        userExists.emergencyEnabled = emergencyEnabled;
      }

      userExists.otp = otp;
      userExists.otpExpire = otpExpire;
      await userExists.save();
      user = userExists;

      // Process face embedding in the background using the in-memory buffer
      if (fileBuffer) {
        setTimeout(async () => {
          try {
            const embedding = await getFaceEmbedding(fileBuffer);
            if (embedding) {
              user.faceEmbedding = encryptData(JSON.stringify(embedding));
              user.emergencyEnabled = true;
              await user.save();
            }
          } catch (err) {
            console.error("Background face embedding failed:", err);
          }
        }, 100);
      }
    } else {
      let avatarUrl = "";
      let fileBuffer = null;
      if (req.file) {
        fileBuffer = fs.readFileSync(req.file.path);
        avatarUrl = await uploadToCloudinary(req.file, "avatars");
      }

      const newUser = {
        fullName,
        email,
        password,
        role: "patient",
        age,
        sex,
        bloodGroup,
        allergies,
        currentMedications,
        previousDiseaseHistory,
        familyDiseaseHistory,
        emergencyContact,
        location,
        otp,
        otpExpire,
        isVerified: false,
        avatar: avatarUrl,
      };

      user = await User.create(newUser);

      // Process face embedding in the background to avoid blocking the registration response
      if (fileBuffer) {
        setTimeout(async () => {
          try {
            const embedding = await getFaceEmbedding(fileBuffer);
            if (embedding) {
              user.faceEmbedding = encryptData(JSON.stringify(embedding));
              user.emergencyEnabled = true;
              await user.save();
              console.log(
                `[Patient Registration] Background face embedding completed for ${user.email}`,
              );
            }
          } catch (err) {
            console.error("Background face embedding failed:", err);
          }
        }, 100);
      }
    }

    try {
      console.log(
        `[Patient Registration] Generated OTP for ${user.email}: ${otp}`,
      );
      await sendEmail({
        email: user.email,
        subject: "MediAI - Verify Your Email",
        message: `Hello,\n\nWe received a request to verify your email address. Your verification code is: ${otp}\n\nThis code will expire in 10 minutes. If you did not request this, you can safely ignore this email.\n\nBest regards,\nThe MediAI Team`,
        html: getOtpTemplate(otp),
      });
    } catch (error) {
      console.error("Email sending failed", error);
    }

    res
      .status(200)
      .json({ success: true, message: "OTP sent to email", requireOtp: true });
  } catch (error) {
    next(error);
  }
};

// @desc    Register a new doctor
// @route   POST /api/auth/doctor/register
// @access  Public
export const registerDoctor = async (req, res, next) => {
  try {
    let {
      fullName,
      email,
      password,
      specialization,
      licenseNumber,
      yearsOfExperience,
      hospitalName,
      clinicAddress,
      phone,
      location,
    } = req.body;
    if (email) email = email.toLowerCase();

    const userExists = await User.findOne({ email });
    let doctorExists = await Doctor.findOne({ email });

    if (userExists) {
      return res
        .status(400)
        .json({ success: false, message: "Email already registered" });
    }

    // No OTP is generated here anymore, it's sent upon admin approval

    console.log("[RegisterDoctor] req.body:", req.body);
    console.log("[RegisterDoctor] req.files:", req.files);

    let degreeCertificate = "";
    let governmentId = "";
    let medicalLicenseProof = "";
    let avatar = "";

    if (req.files?.["degreeCertificate"]?.[0]) {
      degreeCertificate = await uploadToCloudinary(
        req.files["degreeCertificate"][0],
        "doctor_docs",
      );
    }
    if (req.files?.["governmentId"]?.[0]) {
      governmentId = await uploadToCloudinary(
        req.files["governmentId"][0],
        "doctor_docs",
      );
    }
    if (req.files?.["medicalLicenseProof"]?.[0]) {
      medicalLicenseProof = await uploadToCloudinary(
        req.files["medicalLicenseProof"][0],
        "doctor_docs",
      );
    }
    if (req.files?.["profilePhoto"]?.[0]) {
      avatar = await uploadToCloudinary(
        req.files["profilePhoto"][0],
        "avatars",
      );
    }

    let doctor;
    if (doctorExists) {
      if (doctorExists.isVerified) {
        return res
          .status(400)
          .json({
            success: false,
            message: "Email already registered and verified",
          });
      }
      if (fullName) doctorExists.fullName = fullName;
      if (password) doctorExists.password = password;
      if (specialization) doctorExists.specialization = specialization;
      if (licenseNumber) doctorExists.licenseNumber = licenseNumber;
      if (yearsOfExperience) doctorExists.yearsOfExperience = yearsOfExperience;
      if (hospitalName) doctorExists.hospitalName = hospitalName;
      if (clinicAddress) doctorExists.clinicAddress = clinicAddress;
      if (phone) doctorExists.phone = phone;
      if (location) doctorExists.location = location;
      if (degreeCertificate) doctorExists.degreeCertificate = degreeCertificate;
      if (governmentId) doctorExists.governmentId = governmentId;
      if (medicalLicenseProof)
        doctorExists.medicalLicenseProof = medicalLicenseProof;
      if (avatar) doctorExists.avatar = avatar;
      doctorExists.otp = undefined;
      doctorExists.otpExpire = undefined;
      await doctorExists.save();
      doctor = doctorExists;
    } else {
      doctor = await Doctor.create({
        fullName,
        email,
        password,
        role: "doctor",
        specialization,
        licenseNumber,
        yearsOfExperience,
        hospitalName,
        clinicAddress,
        phone,
        location,
        degreeCertificate,
        governmentId,
        medicalLicenseProof,
        avatar,
        verificationStatus: "pending",
        isVerified: false,
      });
    }

    res
      .status(200)
      .json({
        success: true,
        message: "Registration submitted for Our Team approval",
        requireOtp: false,
        verificationStatus: "pending",
      });
  } catch (error) {
    console.error("Error in registerDoctor:", error);
    next(error);
  }
};

// @desc    Register a new hospital (admin)
// @route   POST /api/auth/hospital/register
// @access  Public
export const registerHospital = async (req, res, next) => {
  try {
    let {
      hospitalName,
      hospitalContactNumber,
      hospitalMapLink,
      email,
      password,
      hospitalRegistrationNumber,
      organizationPan,
    } = req.body;
    if (email) email = email.toLowerCase();

    const fullName = hospitalName || "Hospital Admin"; // Fallback for required fullName

    const userExists = await User.findOne({ email });
    let doctorExists = await Doctor.findOne({ email });

    if (userExists || doctorExists) {
      return res
        .status(400)
        .json({ success: false, message: "Email already registered" });
    }

    console.log("[RegisterHospital] req.body:", req.body);
    console.log("[RegisterHospital] req.files:", req.files);

    let hospitalRegistrationCertificate = "";
    let legalEntityProof = "";
    let authorizedRepGovId = "";
    let authorizationProof = "";
    let hospitalAddressProof = "";
    let nabhCertificate = "";
    let gstCertificate = "";

    if (req.files?.["hospitalRegistrationCertificate"]?.[0]) {
      hospitalRegistrationCertificate = await uploadToCloudinary(
        req.files["hospitalRegistrationCertificate"][0],
        "hospital_docs",
      );
    }
    if (req.files?.["legalEntityProof"]?.[0]) {
      legalEntityProof = await uploadToCloudinary(
        req.files["legalEntityProof"][0],
        "hospital_docs",
      );
    }
    if (req.files?.["authorizedRepGovId"]?.[0]) {
      authorizedRepGovId = await uploadToCloudinary(
        req.files["authorizedRepGovId"][0],
        "hospital_docs",
      );
    }
    if (req.files?.["authorizationProof"]?.[0]) {
      authorizationProof = await uploadToCloudinary(
        req.files["authorizationProof"][0],
        "hospital_docs",
      );
    }
    if (req.files?.["hospitalAddressProof"]?.[0]) {
      hospitalAddressProof = await uploadToCloudinary(
        req.files["hospitalAddressProof"][0],
        "hospital_docs",
      );
    }
    if (req.files?.["nabhCertificate"]?.[0]) {
      nabhCertificate = await uploadToCloudinary(
        req.files["nabhCertificate"][0],
        "hospital_docs",
      );
    }
    if (req.files?.["gstCertificate"]?.[0]) {
      gstCertificate = await uploadToCloudinary(
        req.files["gstCertificate"][0],
        "hospital_docs",
      );
    }

    await User.create({
      fullName,
      email,
      password,
      role: "admin",
      verificationStatus: "pending",
      isVerified: false,
      hospitalName,
      hospitalContactNumber,
      hospitalMapLink,
      hospitalRegistrationNumber,
      organizationPan,
      hospitalRegistrationCertificate,
      legalEntityProof,
      authorizedRepGovId,
      authorizationProof,
      hospitalAddressProof,
      nabhCertificate,
      gstCertificate,
    });

    res
      .status(200)
      .json({
        success: true,
        message: "Registration submitted for Our Team approval",
        requireOtp: false,
        verificationStatus: "pending",
      });
  } catch (error) {
    console.error("Error in registerHospital:", error);
    next(error);
  }
};

// @desc    Verify OTP for registration
// @route   POST /api/auth/verify-otp
// @access  Public
export const verifyOtp = async (req, res, next) => {
  try {
    let { email, otp, role } = req.body;
    if (email) email = email.toLowerCase();
    if (!email || !otp) {
      return res
        .status(400)
        .json({ success: false, message: "Please provide email and OTP" });
    }

    // Attempt to locate the user in User collection first (patients/admins) then Doctor collection
    let user = null;
    let isDoctor = false;

    if (role === "doctor") {
      user = await Doctor.findOne({ email });
      if (user) isDoctor = true;
      if (!user) user = await User.findOne({ email });
    } else if (role === "patient" || role === "admin") {
      user = await User.findOne({ email });
      if (!user) {
        user = await Doctor.findOne({ email });
        if (user) isDoctor = true;
      }
    } else {
      // No explicit role specified: search User collection first, then Doctor
      user = await User.findOne({ email });
      if (!user) {
        user = await Doctor.findOne({ email });
        if (user) isDoctor = true;
      }
    }

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // If user is already verified and has no pending OTP, return existing session
    if (user.isVerified && (!user.otp || user.otp === '')) {
      return sendTokenResponse(user, 200, res, isDoctor);
    }

    if (!user.otp || String(user.otp).trim() !== String(otp).trim()) {
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }
    if (user.otpExpire < new Date()) {
      return res
        .status(400)
        .json({
          success: false,
          message: "OTP has expired. Please request a new one.",
        });
    }

    // Mark as verified and clear OTP fields
    user.isVerified = true;
    user.otp = undefined;
    user.otpExpire = undefined;
    // For doctors, ensure account status is active after verification
    if (isDoctor && user.accountStatus !== "active") {
      user.accountStatus = "active";
    }
    await user.save();

    // Notify admins that a doctor has completed verification
    if (isDoctor) {
      const admins = await User.find({ role: "admin" });
      const notifPromises = admins.map((admin) =>
        Notification.create({
          recipient: admin._id,
          recipientModel: "User",
          title: "Doctor Verified",
          message: `Doctor ${user.fullName} has completed verification.`,
          type: "general",
          route: "/admin/doctors",
        }),
      );
      await Promise.all(notifPromises);
    }
    sendTokenResponse(user, 200, res, isDoctor);
  } catch (error) {
    next(error);
  }
};

// @desc    Resend OTP for registration
// @route   POST /api/auth/resend-otp
// @access  Public
export const resendOtp = async (req, res, next) => {
  try {
    let { email, role } = req.body;
    if (email) email = email.toLowerCase();

    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: "Please provide email" });
    }

    let user;
    if (role === "doctor") {
      user = await Doctor.findOne({ email });
    } else {
      user = await User.findOne({ email });
    }

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (user.isVerified) {
      return res
        .status(400)
        .json({ success: false, message: "User is already verified" });
    }

    const otp = generateOtp();
    const otpExpire = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    user.otp = otp;
    user.otpExpire = otpExpire;
    await user.save();

    try {
      await sendEmail({
        email: user.email,
        subject: "MediAI - Resend OTP Verification",
        message: `Hello,\n\nWe received a request to verify your email address. Your verification code is: ${otp}\n\nThis code will expire in 10 minutes. If you did not request this, you can safely ignore this email.\n\nBest regards,\nThe MediAI Team`,
        html: getOtpTemplate(otp),
      });
    } catch (error) {
      console.error("Email sending failed", error);
    }

    res
      .status(200)
      .json({ success: true, message: "New OTP sent to your email" });
  } catch (error) {
    next(error);
  }
};

// @desc    Re-submit doctor verification
// @route   PUT /api/auth/doctor/reverify
// @access  Private (Doctor)
export const reverifyDoctor = async (req, res, next) => {
  try {
    const doctor = await Doctor.findById(req.user._id);
    if (!doctor) {
      return res
        .status(404)
        .json({ success: false, message: "Doctor not found" });
    }

    const {
      fullName,
      specialization,
      licenseNumber,
      yearsOfExperience,
      hospitalName,
      clinicAddress,
      phone,
      location,
    } = req.body;

    // Update basic info
    if (fullName) doctor.fullName = fullName;
    if (specialization) doctor.specialization = specialization;
    if (licenseNumber) doctor.licenseNumber = licenseNumber;
    if (yearsOfExperience) doctor.yearsOfExperience = yearsOfExperience;
    if (hospitalName) doctor.hospitalName = hospitalName;
    if (clinicAddress) doctor.clinicAddress = clinicAddress;
    if (phone) doctor.phone = phone;
    if (location) doctor.location = location;

    // Update files if provided
    if (req.files) {
      if (req.files["degreeCertificate"]?.[0]) {
        doctor.degreeCertificate = await uploadToCloudinary(
          req.files["degreeCertificate"][0],
          "doctor_docs",
        );
      }
      if (req.files["governmentId"]?.[0]) {
        doctor.governmentId = await uploadToCloudinary(
          req.files["governmentId"][0],
          "doctor_docs",
        );
      }
      if (req.files["medicalLicenseProof"]?.[0]) {
        doctor.medicalLicenseProof = await uploadToCloudinary(
          req.files["medicalLicenseProof"][0],
          "doctor_docs",
        );
      }
      if (req.files["profilePhoto"]?.[0]) {
        doctor.avatar = await uploadToCloudinary(
          req.files["profilePhoto"][0],
          "avatars",
        );
      }
    }

    // Reset status to pending
    doctor.verificationStatus = "pending";
    doctor.rejectionReason = "";

    await doctor.save();

    res.status(200).json({
      success: true,
      message: "Verification request re-submitted successfully",
      verificationStatus: "pending",
    });
  } catch (error) {
    console.error("Error in reverifyDoctor:", error);
    next(error);
  }
};

// @desc    Login User / Doctor / Admin
// @route   POST /api/auth/login
// @access  Public
export const login = async (req, res, next) => {
  try {
    let { email, password, adminAccessCode, role: requestedRole } = req.body;

    if (email) email = email.toLowerCase().trim();

    console.log(
      `[Login] Attempt for ${email} as ${requestedRole || "unknown"}`,
    );

    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Please provide email and password" });
    }

    let user = null;
    let isDoctor = false;

    // Strict role-based collection selection
    if (requestedRole === "doctor") {
      user = await Doctor.findOne({ email }).select("+password");
      isDoctor = true;
      if (user) user.role = "doctor"; // Ensure role is set correctly
    } else if (
      requestedRole === "admin" ||
      requestedRole === "patient" ||
      requestedRole === "super_admin"
    ) {
      user = await User.findOne({ email }).select("+password +adminAccessCode");
      // Ensure the found user actually has the requested role (e.g. don't log in as patient if admin was requested)
      if (user && user.role !== requestedRole) {
        // Auto-upgrade/fix role if an admin logs in on the super_admin tab or vice versa
        if (
          (user.role === "super_admin" && requestedRole === "admin") ||
          (user.role === "admin" && requestedRole === "super_admin")
        ) {
          console.log(
            `[Login] Role auto-corrected from ${requestedRole} to ${user.role}`,
          );
          // Accept it, don't nullify user
        } else {
          console.log(
            `[Login] Role mismatch: Found ${user.role} but requested ${requestedRole}`,
          );
          user = null;
        }
      }
    } else {
      // Fallback for cases where role is not provided - search User and Doctor concurrently
      console.log("[Login] Performing fast concurrent user and doctor lookup");
      const [foundUser, foundDoctor] = await Promise.all([
        User.findOne({ email }).select("+password +adminAccessCode").lean(),
        Doctor.findOne({ email }).select("+password").lean()
      ]);

      if (foundUser) {
        user = await User.hydrate(foundUser);
      } else if (foundDoctor) {
        user = await Doctor.hydrate(foundDoctor);
        isDoctor = true;
        user.role = "doctor";
      }
    }

    if (!user) {
      console.log("[Login] User not found or role mismatch");
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }

    // Validate password
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      console.log("[Login] Password mismatch");
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }

    // Removed admin access code check to allow simple credential login

    // Account status check
    const accountStatus = isDoctor
      ? user.accountStatus
      : user.isActive
        ? "active"
        : "suspended";
    if (accountStatus === "suspended") {
      console.log("[Login] Account suspended");
      return res
        .status(403)
        .json({ success: false, message: "Account is suspended" });
    }

    if (user.isVerified === false && user.role !== "admin") {
      console.log("[Login] Account not verified");
      // Check if it's an approved doctor (or pending)
      const isApprovedDoctor =
        isDoctor && user.verificationStatus === "approved";
      const isPatient = user.role === "patient";
      const canVerify = isApprovedDoctor || isPatient;

      if (canVerify) {
        // Automatically generate and send a new OTP since there is no resend button on login UI
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        user.otp = otp;
        user.otpExpire = new Date(Date.now() + 10 * 60 * 1000); // 10 mins
        await user.save({ validateBeforeSave: false });

        try {
          await sendEmail({
            email: user.email,
            subject: "MediAI - Verify Your Email",
            message: `Hello,\n\nWe received a login attempt for your unverified account. Your new verification code is: ${otp}\n\nThis code will expire in 10 minutes.\n\nBest regards,\nThe MediAI Team`,
            html: getOtpTemplate(otp),
          });
          console.log(`[Login] Resent OTP to ${user.email}`);
        } catch (error) {
          console.error("Email sending failed during login", error);
        }
      }

      return res.status(401).json({
        success: false,
        message: canVerify
          ? "A fresh OTP has been sent to your email. Please verify to log in."
          : "Please wait for admin approval to verify your email.",
        requireOtp: canVerify,
      });
    }

    console.log(`[Login] Success: ${user.email} logged in as ${user.role}`);
    sendTokenResponse(user, 200, res, isDoctor);
  } catch (error) {
    console.error("[Login] Error:", error);
    next(error);
  }
};

// @desc    Forgot Password
// @route   POST /api/auth/forgot-password
// @access  Public
export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    let user = await User.findOne({ email });
    let isDoctor = false;

    if (!user) {
      user = await Doctor.findOne({ email });
      isDoctor = true;
    }

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "There is no user with that email" });
    }

    // Get reset token
    const resetToken = crypto.randomBytes(20).toString("hex");

    // Hash token and set to resetPasswordToken field
    user.resetPasswordToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    // Set expire
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 mins

    await user.save({ validateBeforeSave: false });

    // Mock email sending
    console.log(`[FORGOT PASSWORD] Token for ${email}: ${resetToken}`);

    res.status(200).json({
      success: true,
      message:
        "Password reset token generated. Check console for token (Mock).",
      token: resetToken, // In production, don't send this back. Send via email.
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Reset Password
// @route   POST /api/auth/reset-password/:token
// @access  Public
export const resetPassword = async (req, res, next) => {
  try {
    // Get hashed token
    const resetPasswordToken = crypto
      .createHash("sha256")
      .update(req.params.token)
      .digest("hex");

    let user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      user = await Doctor.findOne({
        resetPasswordToken,
        resetPasswordExpire: { $gt: Date.now() },
      });
    }

    if (!user) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired token" });
    }

    // Set new password
    user.password = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    user.mustChangePassword = false;
    await user.save();

    res
      .status(200)
      .json({ success: true, message: "Password reset successful" });
  } catch (error) {
    next(error);
  }
};

// @desc    Update Password (logged in)
// @route   PUT /api/auth/change-password
// @access  Private
export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    let user;
    if (req.user.role === "doctor") {
      user = await Doctor.findById(req.user.id).select("+password");
    } else {
      user = await User.findById(req.user.id).select("+password");
    }

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Check current password
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res
        .status(401)
        .json({ success: false, message: "Current password is incorrect" });
    }

    user.password = newPassword;
    user.mustChangePassword = false;
    await user.save();

    res
      .status(200)
      .json({ success: true, message: "Password updated successfully" });
  } catch (error) {
    next(error);
  }
};
export const getMe = async (req, res, next) => {
  try {
    if (req.user) {
      let userData = req.user.toObject ? req.user.toObject() : { ...req.user };

      if (req.user.role === "doctor") {
        const doctor = await Doctor.findById(req.user._id);
        if (doctor) {
          const computed = await computeDoctorStatus(doctor);
          userData.onlineStatus = computed;
          userData.breakExpiresAt = doctor.breakExpiresAt;
          userData.dailyBreak = doctor.dailyBreak;
        }
      }

      return res.status(200).json({
        success: true,
        data: userData,
      });
    }
    res.status(401).json({ success: false, message: "Not authorized" });
  } catch (error) {
    next(error);
  }
};

// @desc    Update current user's profile
// @route   PATCH /api/auth/profile
// @access  Private
export const updateProfile = async (req, res, next) => {
  try {
    const {
      fullName,
      email,
      phone,
      sex,
      address,
      dob,
      bloodGroup,
      emergencyContact,
      emergencyLocationEnabled,
      bio,
      specialization,
      licenseNumber,
      yearsOfExperience,
      hospitalName,
      clinicAddress,
      weeklyAvailability,
      onlineStatus,
      breakDuration,
      dailyBreak,
      wearableSource,
      documents,
    } = req.body;

    let user;
    if (req.user.role === "doctor") {
      user = await Doctor.findById(req.user._id);
    } else {
      user = await User.findById(req.user._id);
    }

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (fullName) user.fullName = fullName;
    if (phone !== undefined) user.phone = phone;
    if (sex !== undefined) user.sex = sex;
    if (address !== undefined) user.address = address;
    if (dob !== undefined) user.dob = dob;
    if (bloodGroup !== undefined) user.bloodGroup = bloodGroup;
    if (emergencyContact !== undefined)
      user.emergencyContact = emergencyContact;
    if (documents !== undefined) user.documents = documents;

    // Patient specific field: wearable source and location tracking
    if (wearableSource !== undefined && req.user.role === "patient") {
      user.wearableSource = wearableSource;
    }
    if (emergencyLocationEnabled !== undefined && req.user.role === "patient") {
      user.emergencyLocationEnabled = emergencyLocationEnabled;
    }

    // Doctor specific fields
    if (bio !== undefined) user.bio = bio;
    if (specialization !== undefined) user.specialization = specialization;
    if (licenseNumber !== undefined) user.licenseNumber = licenseNumber;
    if (yearsOfExperience !== undefined)
      user.yearsOfExperience = yearsOfExperience;
    if (hospitalName !== undefined) user.hospitalName = hospitalName;
    if (clinicAddress !== undefined) user.clinicAddress = clinicAddress;
    if (weeklyAvailability !== undefined)
      user.weeklyAvailability = weeklyAvailability;
    if (dailyBreak !== undefined) user.dailyBreak = dailyBreak;

    if (onlineStatus !== undefined) {
      user.onlineStatus = onlineStatus;
      if (onlineStatus === "break") {
        if (breakDuration && breakDuration !== "indefinite") {
          const durationMinutes = parseInt(breakDuration, 10);
          user.breakExpiresAt = new Date(
            Date.now() + durationMinutes * 60 * 1000,
          );
        } else {
          user.breakExpiresAt = undefined; // Indefinite
        }
      } else {
        user.breakExpiresAt = undefined;
      }

      // Emit socket event for real-time status updates
      const io = req.app.get("io");
      if (io && req.user.role === "doctor") {
        io.emit("doctorStatusChanged", {
          doctorId: user._id,
          status: onlineStatus,
          breakExpiresAt: user.breakExpiresAt,
        });
      }
    }

    // If email is changing, check it's not taken
    if (email && email !== user.email) {
      const emailLower = email.toLowerCase();
      const existingUser = await User.findOne({ email: emailLower });
      const existingDoctor = await Doctor.findOne({ email: emailLower });
      if (existingUser || existingDoctor) {
        return res
          .status(400)
          .json({ success: false, message: "Email already in use" });
      }
      user.email = emailLower;
    }

    await user.save({ validateBeforeSave: false });

    let calculatedStatus = user.onlineStatus;
    if (req.user.role === "doctor") {
      calculatedStatus = await computeDoctorStatus(user);
    }

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: {
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        sex: user.sex,
        address: user.address,
        dob: user.dob,
        bloodGroup: user.bloodGroup,
        emergencyContact: user.emergencyContact,
        emergencyLocationEnabled: user.emergencyLocationEnabled,
        wearableSource: user.wearableSource,
        documents: user.documents,
        bio: user.bio,
        specialization: user.specialization,
        licenseNumber: user.licenseNumber,
        yearsOfExperience: user.yearsOfExperience,
        hospitalName: user.hospitalName,
        clinicAddress: user.clinicAddress,
        weeklyAvailability: user.weeklyAvailability,
        onlineStatus: calculatedStatus,
        breakExpiresAt: user.breakExpiresAt,
        dailyBreak: user.dailyBreak,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update profile photo (avatar)
// @route   PATCH /api/auth/avatar
// @access  Private
export const updateAvatar = async (req, res, next) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded" });
    }

    let user;
    if (req.user.role === "doctor") {
      user = await Doctor.findById(req.user._id);
    } else {
      user = await User.findById(req.user._id);
    }

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Extract face embedding before deleting/uploading
    try {
      const buffer = fs.readFileSync(req.file.path);
      const embedding = await getFaceEmbedding(buffer);
      if (embedding) {
        user.faceEmbedding = encryptData(JSON.stringify(embedding));
        // If it's a patient, enable emergency discovery
        if (user.role === "patient") {
          user.emergencyEnabled = true;
        }
      }
    } catch (err) {
      console.error(
        "Error extracting face embedding during avatar update:",
        err,
      );
    }

    // Upload to Cloudinary and clean up local file
    const cloudinaryUrl = await uploadToCloudinary(req.file, "avatars");
    user.avatar = cloudinaryUrl || req.file.filename;

    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      success: true,
      message: "Avatar updated successfully",
      data: { avatar: user.avatar },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update emergency face profile
// @route   PATCH /api/auth/emergency-profile
// @access  Private
export const updateEmergencyProfile = async (req, res, next) => {
  try {
    let user;
    if (req.user.role === "doctor") {
      user = await Doctor.findById(req.user._id);
    } else {
      user = await User.findById(req.user._id);
    }

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const { emergencyEnabled } = req.body;

    if (emergencyEnabled !== undefined) {
      user.emergencyEnabled =
        emergencyEnabled === "true" || emergencyEnabled === true;
    }

    if (req.file) {
      // Check if it's a memory buffer or a file path (multer config dependent)
      let buffer = req.file.buffer;
      if (!buffer && req.file.path) {
        const fs = await import("fs");
        buffer = fs.readFileSync(req.file.path);
      }
      const embedding = await getFaceEmbedding(buffer);
      if (!embedding) {
        return res
          .status(400)
          .json({ success: false, message: "No face detected in the image" });
      }
      const encrypted = encryptData(JSON.stringify(embedding));
      user.faceEmbedding = encrypted;
    }

    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      success: true,
      message: "Emergency profile updated successfully",
      data: {
        emergencyEnabled: user.emergencyEnabled,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Refresh Access Token
// @route   POST /api/auth/refresh
// @access  Public
export const refreshAccessToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res
        .status(401)
        .json({ success: false, message: "Refresh token is required" });
    }

    // Verify the refresh token
    let decoded;
    try {
      const jwt = await import("jsonwebtoken");
      decoded = jwt.default.verify(refreshToken, process.env.JWT_SECRET);
    } catch (err) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid or expired refresh token" });
    }

    if (!decoded.isRefreshToken) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid token type" });
    }

    // Make sure user still exists and account is active
    let user;
    if (decoded.role === "doctor") {
      user = await Doctor.findById(decoded.id);
    } else {
      user = await User.findById(decoded.id);
    }

    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "User not found" });
    }

    const isDoctor = decoded.role === "doctor";
    const accountStatus = isDoctor
      ? user.accountStatus
      : user.isActive
        ? "active"
        : "suspended";

    if (accountStatus === "suspended") {
      return res
        .status(403)
        .json({ success: false, message: "Account is suspended" });
    }

    // Generate new tokens
    const { generateAccessToken, generateRefreshToken } =
      await import("../utils/generateToken.js");
    const newToken = generateAccessToken(user._id, user.role);
    const newRefreshToken = generateRefreshToken(user._id, user.role);

    res.status(200).json({
      success: true,
      token: newToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    next(error);
  }
};
