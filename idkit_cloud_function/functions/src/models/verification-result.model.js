class VerificationResult {
    constructor(data = {}) {
        this.document_type = data.documentName || null;
        this.document_number = data.ocr?.identityCardNumber || null;
        this.personal_number = data.ocr?.personalNumber || null;
        this.issuing_state = data.countryName || null;
        this.first_name = data.ocr?.name?.split(" ")[0] || null;
        this.last_name = data.ocr?.name?.split(" ")[1] || null;
        this.date_of_birth = data.ocr?.dateOfBirth || null;
        this.expiration_date = null;
        this.gender = null;
        this.document_valid = data.ocr?.validState === 1;
        this.status = "IN_REVIEW";
        this.vendor_id = data.id || null;
        this.document_score = data.score || 0;
        this.image = {
            portrait: data.image?.portrait || null,
            signature: data.image?.signature || null,
            documentFrontSide: data.image?.documentFrontSide || null,
            documentBackSide: data.image?.documentBackSide || null,
        };
        this.ocr_data = data.ocr || {};
        this.nation_data = data.nation || {};
    }

    validate() {
        if (!this.document_type) throw new Error("Document type is required");
        return this;
    }
}

module.exports = VerificationResult;

