FROM python:3.10

# Hugging Face Spaces require a non-root user (1000)
RUN useradd -m -u 1000 user

# Install required system dependencies for OpenCV/AI models
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    wget \
    unzip \
    && rm -rf /var/lib/apt/lists/*

USER user
ENV PATH="/home/user/.local/bin:$PATH"

# Download and extract the buffalo_l AI models
RUN mkdir -p /home/user/.insightface/models/buffalo_l && \
    wget -q https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip -O /tmp/buffalo_l.zip && \
    unzip -q /tmp/buffalo_l.zip -d /home/user/.insightface/models/buffalo_l && \
    rm /tmp/buffalo_l.zip

WORKDIR /app

# Copy the entire workspace into /app
COPY --chown=user . /app

# Change directory to backend to install its python requirements
WORKDIR /app/backend
RUN pip install --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 7860
ENV PORT=7860

# Run uvicorn from inside the backend directory
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
