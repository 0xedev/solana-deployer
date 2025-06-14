// pinataStorage.js

import axios from "axios";
import FormData from "form-data";

/**
 * Uploads a JSON metadata object to IPFS via Pinata
 */
export async function uploadMetadataToPinata(metadata, tokenName) {
  const pinataJWT = import.meta.env.VITE_PUBLIC_PINATA_JWT;

  const url = "https://api.pinata.cloud/pinning/pinJSONToIPFS";

  const body = {
    pinataMetadata: {
      name: `${tokenName}-metadata`,
    },
    pinataContent: metadata,
  };

  const headers = {
    Authorization: `Bearer ${pinataJWT}`,
    "Content-Type": "application/json",
  };

  try {
    const res = await axios.post(url, body, { headers });
    const ipfsHash = res.data.IpfsHash;
    return `https://ipfs.io/ipfs/${ipfsHash}`;
  } catch (err) {
    console.error("Pinata upload failed:", err.response?.data || err);
    throw err;
  }
}
