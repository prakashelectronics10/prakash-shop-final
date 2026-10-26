import { useEffect, useRef, useState } from "react";
import { Loader2, MessageCircle, X } from "lucide-react";
import toast from "react-hot-toast";
import { apiRequest } from "../../api/client";
import "./WhatsAppOtpModal.css";

const OTP_LENGTH = 6;

export function WhatsAppOtpModal({
  open,
  purpose,
  whatsappNumber,
  customerName = "",
  onClose,
  onVerified,
}) {
  const [challengeId, setChallengeId] = useState("");
  const [digits, setDigits] = useState(Array(OTP_LENGTH).fill(""));
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [masked, setMasked] = useState("");
  const [error, setError] = useState("");
  const inputsRef = useRef([]);
  const sentForOpenRef = useRef(false);

  useEffect(() => {
    if (!open) {
      sentForOpenRef.current = false;
      setDigits(Array(OTP_LENGTH).fill(""));
      setChallengeId("");
      setError("");
      setVerifying(false);
      setSending(false);
      setResendIn(0);
      return undefined;
    }

    if (!sentForOpenRef.current) {
      sentForOpenRef.current = true;
      requestOtp();
    }

    const timer = setInterval(() => {
      setResendIn((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape" && !verifying && !sending) onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, verifying, sending, onClose]);

  const requestOtp = async (isResend = false) => {
    setSending(true);
    setError("");
    try {
      const response = await apiRequest("/public/whatsapp-otp/send", {
        method: "POST",
        cache: "no-store",
        body: JSON.stringify({
          purpose,
          whatsappNumber,
          customerName,
          ...(isResend && challengeId ? { challengeId } : {}),
        }),
      });
      const data = response.data || {};
      setChallengeId(data.challengeId || "");
      setMasked(data.maskedWhatsApp || whatsappNumber);
      setResendIn(Math.ceil((data.resendAvailableInMs || 45000) / 1000));
      setDigits(Array(OTP_LENGTH).fill(""));
      setTimeout(() => inputsRef.current[0]?.focus(), 50);
      toast.success("Verification code WhatsApp par bhej diya gaya hai", { id: "wa-otp-send" });
    } catch (err) {
      setError(err.message || "OTP bhej nahi paye");
      toast.error(err.message || "OTP bhej nahi paye", { id: "wa-otp-send" });
    } finally {
      setSending(false);
    }
  };

  const updateDigit = (index, value) => {
    const clean = String(value || "").replace(/\D/g, "");
    if (!clean) {
      setDigits((current) => {
        const next = [...current];
        next[index] = "";
        return next;
      });
      return;
    }

    const chars = clean.slice(0, OTP_LENGTH - index).split("");
    setDigits((current) => {
      const next = [...current];
      chars.forEach((char, offset) => {
        next[index + offset] = char;
      });
      return next;
    });
    const focusAt = Math.min(index + chars.length, OTP_LENGTH - 1);
    inputsRef.current[focusAt]?.focus();
  };

  const onKeyDown = (index, event) => {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const code = digits.join("");

  const verify = async (event) => {
    event?.preventDefault?.();
    if (code.length !== OTP_LENGTH || !challengeId || verifying) return;
    setVerifying(true);
    setError("");
    try {
      const response = await apiRequest("/public/whatsapp-otp/verify", {
        method: "POST",
        cache: "no-store",
        body: JSON.stringify({
          purpose,
          whatsappNumber,
          challengeId,
          otp: code,
        }),
      });
      const data = response.data || {};
      toast.success("WhatsApp number verify ho gaya", { id: "wa-otp-verify" });
      onVerified?.({
        challengeId: data.challengeId,
        verifiedToken: data.verifiedToken,
        whatsappNumber: data.whatsappNumber || whatsappNumber,
      });
    } catch (err) {
      setError(err.message || "Galat code");
      toast.error(err.message || "Verification fail hui", { id: "wa-otp-verify" });
      setDigits(Array(OTP_LENGTH).fill(""));
      setTimeout(() => inputsRef.current[0]?.focus(), 30);
    } finally {
      setVerifying(false);
    }
  };

  if (!open) return null;

  return (
    <div className="wa-otp-overlay" role="presentation" onMouseDown={(e) => {
      if (e.target === e.currentTarget && !verifying && !sending) onClose?.();
    }}>
      <div className="wa-otp-dialog" role="dialog" aria-modal="true" aria-labelledby="wa-otp-title">
        <button type="button" className="wa-otp-close" onClick={onClose} disabled={verifying || sending} aria-label="Close">
          <X size={18} />
        </button>
        <div className="wa-otp-icon">
          <MessageCircle size={28} />
        </div>
        <h2 id="wa-otp-title">WhatsApp verification</h2>
        <p className="wa-otp-subtitle">
          {sending && !challengeId
            ? "WhatsApp par 6-digit code bhej rahe hain…"
            : <>Humne <strong>{masked || whatsappNumber}</strong> par 6-digit code bheja hai. Neeche daalein.</>}
        </p>

        <form onSubmit={verify} className="wa-otp-form">
          <div className="wa-otp-inputs" role="group" aria-label="6 digit OTP">
            {digits.map((digit, index) => (
              <input
                key={`otp-${index}`}
                ref={(node) => { inputsRef.current[index] = node; }}
                inputMode="numeric"
                autoComplete={index === 0 ? "one-time-code" : "off"}
                maxLength={OTP_LENGTH}
                value={digit}
                disabled={sending || verifying || !challengeId}
                onChange={(e) => updateDigit(index, e.target.value)}
                onKeyDown={(e) => onKeyDown(index, e)}
                aria-label={`Digit ${index + 1}`}
              />
            ))}
          </div>

          {error ? <p className="wa-otp-error" role="alert">{error}</p> : null}

          <button
            type="submit"
            className="wa-otp-submit"
            disabled={code.length !== OTP_LENGTH || verifying || sending || !challengeId}
          >
            {verifying ? <><Loader2 className="wa-otp-spin" size={18} /> Verifying…</> : "Verify & continue"}
          </button>
        </form>

        <div className="wa-otp-footer">
          <button
            type="button"
            className="wa-otp-resend"
            disabled={sending || verifying || resendIn > 0 || !challengeId}
            onClick={() => requestOtp(true)}
          >
            {sending ? "Sending…" : resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
          </button>
          <button type="button" className="wa-otp-cancel" onClick={onClose} disabled={verifying}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
