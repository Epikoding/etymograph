package client

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type LLMClient struct {
	baseURL    string
	httpClient *http.Client
}

func NewLLMClient(baseURL string) *LLMClient {
	return &LLMClient{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 120 * time.Second,
		},
	}
}

type AnalyzeRequest struct {
	Word string `json:"word"`
}

func (c *LLMClient) GetEtymology(word string) (map[string]interface{}, error) {
	return c.callEndpoint("/etymology", word)
}

func (c *LLMClient) GetDerivatives(word string) (map[string]interface{}, error) {
	return c.callEndpoint("/derivatives", word)
}

func (c *LLMClient) GetSynonyms(word string) (map[string]interface{}, error) {
	return c.callEndpoint("/synonyms", word)
}

func (c *LLMClient) callEndpoint(endpoint, word string) (map[string]interface{}, error) {
	reqBody, err := json.Marshal(AnalyzeRequest{Word: word})
	if err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Post(
		c.baseURL+endpoint,
		"application/json",
		bytes.NewBuffer(reqBody),
	)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("LLM proxy returned status %d: %s", resp.StatusCode, string(body))
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return result, nil
}
