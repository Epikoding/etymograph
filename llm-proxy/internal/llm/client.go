package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"
)

type Client struct {
	baseURL    string
	model      string
	httpClient *http.Client
}

type GenerateRequest struct {
	Model  string `json:"model"`
	Prompt string `json:"prompt"`
	Stream bool   `json:"stream"`
}

type GenerateResponse struct {
	Model     string `json:"model"`
	Response  string `json:"response"`
	Done      bool   `json:"done"`
	CreatedAt string `json:"created_at"`
}

func NewClient(baseURL, model string) *Client {
	return &Client{
		baseURL: baseURL,
		model:   model,
		httpClient: &http.Client{
			Timeout: 120 * time.Second,
		},
	}
}

func (c *Client) Generate(ctx context.Context, prompt string) (string, error) {
	reqBody := GenerateRequest{
		Model:  c.model,
		Prompt: prompt,
		Stream: false,
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+"/api/generate", bytes.NewBuffer(jsonBody))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("ollama returned status %d: %s", resp.StatusCode, string(body))
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response: %w", err)
	}

	var genResp GenerateResponse
	if err := json.Unmarshal(body, &genResp); err != nil {
		return "", fmt.Errorf("failed to unmarshal response: %w", err)
	}

	return genResp.Response, nil
}

// ExtractJSON extracts JSON from LLM response that may contain extra text
func ExtractJSON(response string) (string, error) {
	// Try to find JSON object in the response
	// First, try to parse the entire response as JSON
	response = strings.TrimSpace(response)

	// Remove markdown code blocks if present
	response = regexp.MustCompile("(?s)```json\\s*").ReplaceAllString(response, "")
	response = regexp.MustCompile("(?s)```\\s*$").ReplaceAllString(response, "")
	response = strings.TrimSpace(response)

	// Find the first { and last }
	start := strings.Index(response, "{")
	end := strings.LastIndex(response, "}")

	if start == -1 || end == -1 || end < start {
		return "", fmt.Errorf("no valid JSON object found in response")
	}

	jsonStr := response[start : end+1]

	// Validate it's valid JSON
	var js json.RawMessage
	if err := json.Unmarshal([]byte(jsonStr), &js); err != nil {
		return "", fmt.Errorf("extracted text is not valid JSON: %w", err)
	}

	return jsonStr, nil
}
