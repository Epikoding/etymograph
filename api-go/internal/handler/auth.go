package handler

import (
	"crypto/rand"
	"encoding/base64"
	"log"
	"net/http"
	"time"

	"github.com/etymograph/api/internal/auth"
	"github.com/etymograph/api/internal/model"
	"github.com/gin-gonic/gin"
	"golang.org/x/oauth2"
	"gorm.io/gorm"
)

type AuthHandler struct {
	db           *gorm.DB
	jwtSecret    string
	googleConfig *oauth2.Config
	frontendURL  string
}

func NewAuthHandler(db *gorm.DB, jwtSecret string, googleConfig *oauth2.Config, frontendURL string) *AuthHandler {
	return &AuthHandler{
		db:           db,
		jwtSecret:    jwtSecret,
		googleConfig: googleConfig,
		frontendURL:  frontendURL,
	}
}

type TokenResponse struct {
	AccessToken  string      `json:"accessToken"`
	RefreshToken string      `json:"refreshToken"`
	ExpiresIn    int         `json:"expiresIn"`
	User         *model.User `json:"user"`
}

// GoogleAuth redirects to Google OAuth authorization URL
func (h *AuthHandler) GoogleAuth(c *gin.Context) {
	state := generateState()
	// Store state in cookie for CSRF protection
	c.SetCookie("oauth_state", state, 600, "/", "", false, true)

	url := h.googleConfig.AuthCodeURL(state, oauth2.AccessTypeOffline)
	c.Redirect(http.StatusTemporaryRedirect, url)
}

// GoogleCallback handles Google OAuth callback
func (h *AuthHandler) GoogleCallback(c *gin.Context) {
	// Verify state for CSRF protection
	state := c.Query("state")
	savedState, err := c.Cookie("oauth_state")
	if err != nil || state != savedState {
		c.Redirect(http.StatusTemporaryRedirect, h.frontendURL+"?error=invalid_state")
		return
	}
	c.SetCookie("oauth_state", "", -1, "/", "", false, true)

	code := c.Query("code")
	if code == "" {
		c.Redirect(http.StatusTemporaryRedirect, h.frontendURL+"?error=no_code")
		return
	}

	// Exchange code for token
	token, err := h.googleConfig.Exchange(c.Request.Context(), code)
	if err != nil {
		log.Printf("Failed to exchange code: %v", err)
		c.Redirect(http.StatusTemporaryRedirect, h.frontendURL+"?error=exchange_failed")
		return
	}

	// Get user info from Google
	userInfo, err := auth.GetGoogleUserInfo(c.Request.Context(), token)
	if err != nil {
		log.Printf("Failed to get user info: %v", err)
		c.Redirect(http.StatusTemporaryRedirect, h.frontendURL+"?error=user_info_failed")
		return
	}

	// Find or create user
	var user model.User
	result := h.db.Where("provider = ? AND provider_id = ?", "google", userInfo.ID).First(&user)

	if result.Error == gorm.ErrRecordNotFound {
		user = model.User{
			Provider:   "google",
			ProviderID: userInfo.ID,
			Email:      userInfo.Email,
			Name:       userInfo.Name,
			AvatarURL:  userInfo.Picture,
			CreatedAt:  time.Now(),
			UpdatedAt:  time.Now(),
		}
		if err := h.db.Create(&user).Error; err != nil {
			log.Printf("Failed to create user: %v", err)
			c.Redirect(http.StatusTemporaryRedirect, h.frontendURL+"?error=create_user_failed")
			return
		}
	} else if result.Error != nil {
		log.Printf("Failed to find user: %v", result.Error)
		c.Redirect(http.StatusTemporaryRedirect, h.frontendURL+"?error=db_error")
		return
	} else {
		// Update user info
		h.db.Model(&user).Updates(map[string]interface{}{
			"email":      userInfo.Email,
			"name":       userInfo.Name,
			"avatar_url": userInfo.Picture,
			"updated_at": time.Now(),
		})
	}

	// Generate JWT tokens
	accessToken, err := auth.GenerateAccessToken(&user, h.jwtSecret)
	if err != nil {
		log.Printf("Failed to generate access token: %v", err)
		c.Redirect(http.StatusTemporaryRedirect, h.frontendURL+"?error=token_failed")
		return
	}

	refreshToken, err := auth.GenerateRefreshToken()
	if err != nil {
		log.Printf("Failed to generate refresh token: %v", err)
		c.Redirect(http.StatusTemporaryRedirect, h.frontendURL+"?error=token_failed")
		return
	}

	// Store refresh token in database
	refreshTokenModel := model.RefreshToken{
		UserID:    user.ID,
		Token:     refreshToken,
		ExpiresAt: time.Now().Add(auth.RefreshTokenExpiry),
		CreatedAt: time.Now(),
	}
	if err := h.db.Create(&refreshTokenModel).Error; err != nil {
		log.Printf("Failed to store refresh token: %v", err)
		c.Redirect(http.StatusTemporaryRedirect, h.frontendURL+"?error=token_failed")
		return
	}

	// Redirect to frontend with tokens
	redirectURL := h.frontendURL + "?accessToken=" + accessToken + "&refreshToken=" + refreshToken
	c.Redirect(http.StatusTemporaryRedirect, redirectURL)
}

// RefreshToken refreshes access token using refresh token
func (h *AuthHandler) RefreshToken(c *gin.Context) {
	var req struct {
		RefreshToken string `json:"refreshToken" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "refreshToken is required"})
		return
	}

	// Find refresh token
	var refreshToken model.RefreshToken
	result := h.db.Where("token = ? AND revoked = false AND expires_at > ?", req.RefreshToken, time.Now()).First(&refreshToken)
	if result.Error != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired refresh token"})
		return
	}

	// Get user
	var user model.User
	if err := h.db.First(&user, refreshToken.UserID).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not found"})
		return
	}

	// Generate new access token
	accessToken, err := auth.GenerateAccessToken(&user, h.jwtSecret)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate access token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"accessToken": accessToken,
		"expiresIn":   int(auth.AccessTokenExpiry.Seconds()),
	})
}

// Logout invalidates refresh token
func (h *AuthHandler) Logout(c *gin.Context) {
	var req struct {
		RefreshToken string `json:"refreshToken" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "refreshToken is required"})
		return
	}

	// Revoke refresh token
	h.db.Model(&model.RefreshToken{}).Where("token = ?", req.RefreshToken).Update("revoked", true)

	c.JSON(http.StatusOK, gin.H{"message": "logged out successfully"})
}

// Me returns current user info
func (h *AuthHandler) Me(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var user model.User
	if err := h.db.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	c.JSON(http.StatusOK, user)
}

func generateState() string {
	b := make([]byte, 16)
	rand.Read(b)
	return base64.URLEncoding.EncodeToString(b)
}
