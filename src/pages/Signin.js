import { useState, useEffect } from "react"
import { Link, useNavigate, useLocation, Navigate } from "react-router-dom"
import { useAuth } from "../context/AuthContext"
import GoogleOAuth from "../components/GoogleOAuth"
import ForgotPasswordModal from "../components/ForgotPasswordModal"

// Safe-continue: must be a same-origin absolute path.
// Rejects '//example.com/x' (protocol-relative → open redirect) and any
// non-string. Used by the /integrations/proofpix/authorize flow (PR 4)
// to survive the login round-trip; safe to reuse for other flows.
function getSafeContinuePath(search) {
  const params = new URLSearchParams(search || '')
  const raw = params.get('continue')
  if (typeof raw !== 'string' || raw.length === 0) return null
  if (!raw.startsWith('/') || raw.startsWith('//')) return null
  return raw
}

export default function SignInForm() {
  const navigate = useNavigate()
  const location = useLocation()
  const continueTo = getSafeContinuePath(location.search) || '/dashboard'
  const { login, user, loading } = useAuth()
  const [formData, setFormData] = useState({
    email: "",
    password: ""
  })
  const [error, setError] = useState("")

  const [errors, setErrors] = useState({})
  const [isLoading, setIsLoading] = useState(false)
  const [apiError, setApiError] = useState("")
  const [showForgotPassword, setShowForgotPassword] = useState(false)

  // Redirect if already authenticated. Honor ?continue=<path> so flows
  // like /integrations/proofpix/authorize can bounce us here to force a
  // fresh login and then land the user back on the originating page.
  useEffect(() => {
    if (!loading && user) {
      navigate(continueTo, { replace: true })
    }
  }, [user, loading, navigate, continueTo])

  const handleInputChange = (e) => {
    const { name, value } = e.target
    console.log('🔍 Input change:', { name, value })
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
    
    // Clear field-specific error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ""
      }))
    }
    
    // Clear API error when user starts typing
    if (apiError) {
      setApiError("")
    }
  }

  const validateForm = () => {
    const newErrors = {}
    
    if (!formData.email.trim()) {
      newErrors.email = "Email is required"
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = "Please enter a valid email address"
    }
    
    if (!formData.password.trim()) {
      newErrors.password = "Password is required"
    } else if (formData.password.length < 6) {
      newErrors.password = "Password must be at least 6 characters"
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    // Debug: Log form data
    console.log('🔍 Signin formData:', formData)
    
    // Validate form
    if (!validateForm()) {
      return
    }
    
    setIsLoading(true)
    setApiError("")
    setError("") // Clear any previous errors
    
    try {
      const result = await login(formData)
      // Only navigate if login was successful
      if (result && result.success) {
        // Small delay to ensure state is updated
        setTimeout(() => {
          navigate(continueTo, { replace: true })
        }, 100)
      }
    } catch (error) {
      console.error('Signin error:', error)
      console.error('Signin error details:', {
        response: error.response,
        message: error.message,
        stack: error.stack
      })
      
      // Prevent navigation on error
      let errorMessage = "An error occurred. Please try again."
      
      if (error.response) {
        const { status, data } = error.response
        
        switch (status) {
          case 401:
            errorMessage = data?.error || "Invalid email or password"
            break
          case 404:
            errorMessage = "User not found"
            break
          case 500:
            errorMessage = data?.error || "Server error. Please try again later."
            break
          default:
            errorMessage = data?.error || "An error occurred. Please try again."
        }
      } else if (error.request) {
        errorMessage = "Network error. Please check your connection."
      } else if (error.message) {
        errorMessage = error.message
      }
      
      setApiError(errorMessage)
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const handleForgotPassword = () => {
    setShowForgotPassword(true)
  }

  const handleSignUp = () => {
    navigate('/signup')
  }

  const isFormValid = formData.email.trim() !== "" && formData.password.trim() !== ""

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  // Redirect if already authenticated (fallback)
  if (user) {
    return <Navigate to={continueTo} replace />
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Main Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <Link to="/" className="flex items-center">
              <img src="/logo.svg" alt="zenbooker" className="h-10 w-auto" />
            </Link>
          </div>

          {/* API Error Display */}
          {(apiError || error) && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-red-600 text-sm font-medium">{apiError || error}</p>
            </div>
          )}

          {/* Sign In Form */}
          <form
            id="signin-form"
            method="post"
            autoComplete="on"
            onSubmit={handleSubmit}
            className="space-y-4"
          >
            {/* Email Input */}
            <div>
              <label htmlFor="email" className="sr-only">Email Address</label>
              <input
                id="email"
                type="email"
                name="email"
                autoComplete="email"
                placeholder="Email"
                value={formData.email}
                onChange={handleInputChange}
                className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 transition-colors ${
                  errors.email 
                    ? "border-red-500 bg-red-50" 
                    : "border-gray-300 bg-white"
                }`}
                required
                disabled={isLoading}
              />
              {errors.email && (
                <p className="mt-1 text-red-500 text-sm">{errors.email}</p>
              )}
            </div>

            {/* Password Input */}
            <div>
              <label htmlFor="password" className="sr-only">Password</label>
              <input
                id="password"
                type="password"
                name="password"
                placeholder="Password"
                value={formData.password}
                onChange={handleInputChange}
                autoComplete="current-password"
                className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-gray-400 transition-colors ${
                  errors.password 
                    ? "border-red-500 bg-red-50" 
                    : "border-gray-300 bg-white"
                }`}
                required
                disabled={isLoading}
              />
              {errors.password && (
                <p className="mt-1 text-red-500 text-sm">{errors.password}</p>
              )}
            </div>

            {/* Sign In Button - Blue when form is valid */}
            <div>
              <button
                type="submit"
                disabled={!isFormValid || isLoading}
                className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
                  isFormValid && !isLoading
                    ? "bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                    : "bg-gray-200 text-gray-500 cursor-not-allowed"
                }`}
              >
                {isLoading ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Signing In...
                  </div>
                ) : (
                  "Sign In"
                )}
              </button>
            </div>

            {/* Forgot Password Link */}
            <div className="text-center">
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={isLoading}
                className="text-gray-600 hover:text-gray-800 text-sm transition-colors disabled:opacity-50"
              >
                Forgot Password?
              </button>
            </div>
          </form>

          {/* Divider with "Or continue with" */}
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">Or continue with</span>
            </div>
          </div>

          {/* Google OAuth */}
          <div>
            <GoogleOAuth
              onSuccess={(result) => {
                console.log('✅ Google OAuth success:', result);
                navigate(continueTo);
              }}
              onError={(error) => {
                console.error('❌ Google OAuth error:', error);
                setError(error.response?.data?.error || 'Google sign-in failed');
              }}
            />
          </div>

          {/* Error Display */}
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </div>

        {/* Sign Up Section */}
        <div className="text-center mt-6">
          <span className="text-gray-600 text-sm">
            {"Don't have an account? "}
            <button
              onClick={handleSignUp}
              disabled={isLoading}
              className="text-blue-600 hover:text-blue-800 font-medium transition-colors disabled:opacity-50"
            >
              Sign Up
            </button>
          </span>
        </div>
      </div>

      <ForgotPasswordModal
        open={showForgotPassword}
        onClose={() => setShowForgotPassword(false)}
      />
    </div>
  )
}