import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ["system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
        heading: ["Outfit", "system-ui", "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
          muted: "hsl(var(--sidebar-muted))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        xl: "var(--shadow-xl)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(20px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(20px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.95)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        // Hero animation flow steps
        "flow-step-1": {
          "0%, 100%": { opacity: "0.4", transform: "scale(0.98)" },
          "10%, 90%": { opacity: "1", transform: "scale(1)" },
        },
        "flow-step-2": {
          "0%, 15%": { opacity: "0.3", transform: "scale(0.98)" },
          "25%, 85%": { opacity: "1", transform: "scale(1)" },
          "100%": { opacity: "0.4", transform: "scale(0.98)" },
        },
        "flow-step-3": {
          "0%, 30%": { opacity: "0.3", transform: "scale(0.98)" },
          "40%, 80%": { opacity: "1", transform: "scale(1)" },
          "100%": { opacity: "0.4", transform: "scale(0.98)" },
        },
        "flow-step-4": {
          "0%, 50%": { opacity: "0.3", transform: "scale(0.98)" },
          "60%, 75%": { opacity: "1", transform: "scale(1)" },
          "100%": { opacity: "0.4", transform: "scale(0.98)" },
        },
        "flow-step-5": {
          "0%, 60%": { opacity: "0.3", transform: "scale(0.98)" },
          "70%, 100%": { opacity: "1", transform: "scale(1)" },
        },
        "flow-connector": {
          "0%, 20%": { opacity: "0", height: "0" },
          "30%, 100%": { opacity: "1", height: "24px" },
        },
        "flow-connector-2": {
          "0%, 35%": { opacity: "0", height: "0" },
          "45%, 100%": { opacity: "1", height: "24px" },
        },
        "spin-slow": {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
        // Cross-listing demo (10s cycle)
        "crosslist-step-1": {
          "0%, 5%": { opacity: "0", transform: "translateY(8px)" },
          "10%, 65%": { opacity: "1", transform: "translateY(0)" },
          "75%, 100%": { opacity: "0", transform: "translateY(-4px)" },
        },
        "crosslist-step-2": {
          "0%, 18%": { opacity: "0", transform: "scale(0.8)" },
          "25%, 60%": { opacity: "1", transform: "scale(1)" },
          "70%, 100%": { opacity: "0", transform: "scale(0.8)" },
        },
        "crosslist-step-3": {
          "0%, 35%": { opacity: "0", transform: "translateY(8px)" },
          "42%, 55%": { opacity: "1", transform: "translateY(0)" },
          "65%, 100%": { opacity: "0", transform: "translateY(-4px)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.5s ease-out forwards",
        "fade-up": "fade-up 0.6s ease-out forwards",
        "slide-in-right": "slide-in-right 0.4s ease-out forwards",
        "scale-in": "scale-in 0.3s ease-out forwards",
        "pulse-soft": "pulse-soft 2s ease-in-out infinite",
        "flow-step-1": "flow-step-1 6s ease-in-out infinite",
        "flow-step-2": "flow-step-2 6s ease-in-out infinite",
        "flow-step-3": "flow-step-3 6s ease-in-out infinite",
        "flow-step-4": "flow-step-4 6s ease-in-out infinite",
        "flow-step-5": "flow-step-5 6s ease-in-out infinite",
        "flow-connector": "flow-connector 6s ease-in-out infinite",
        "flow-connector-2": "flow-connector-2 6s ease-in-out infinite",
        "spin-slow": "spin-slow 30s linear infinite",
        // Cross-listing demo
        "crosslist-step-1": "crosslist-step-1 10s ease-in-out infinite",
        "crosslist-step-2": "crosslist-step-2 10s ease-in-out infinite",
        "crosslist-step-3": "crosslist-step-3 10s ease-in-out infinite",
        // Hero blobs
        "blob-1": "blob-drift-1 20s ease-in-out infinite",
        "blob-2": "blob-drift-2 25s ease-in-out infinite",
        "blob-3": "blob-drift-3 22s ease-in-out infinite",
        // Hero demo steps (8s cycle)
        "demo-step-1": "demo-step 8s ease-in-out infinite",
        "demo-step-2": "demo-step 8s ease-in-out 1.5s infinite",
        "demo-step-3": "demo-step 8s ease-in-out 3s infinite",
        "demo-connector-1": "demo-connector 8s ease-in-out 1s infinite",
        "demo-connector-2": "demo-connector 8s ease-in-out 2.5s infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
