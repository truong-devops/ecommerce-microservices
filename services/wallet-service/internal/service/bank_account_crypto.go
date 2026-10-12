package service

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"fmt"
	"io"
)

type BankAccountCipher struct {
	aead cipher.AEAD
}

func NewBankAccountCipher(secret string) (*BankAccountCipher, error) {
	if len(secret) < 32 {
		return nil, fmt.Errorf("bank account encryption key must be at least 32 characters")
	}
	key := sha256.Sum256([]byte(secret))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &BankAccountCipher{aead: aead}, nil
}

func (c *BankAccountCipher) Encrypt(value string) ([]byte, []byte, error) {
	nonce := make([]byte, c.aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, nil, err
	}
	return c.aead.Seal(nil, nonce, []byte(value), nil), nonce, nil
}

func (c *BankAccountCipher) Decrypt(ciphertext, nonce []byte) (string, error) {
	plaintext, err := c.aead.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", fmt.Errorf("decrypt bank account number: %w", err)
	}
	return string(plaintext), nil
}
