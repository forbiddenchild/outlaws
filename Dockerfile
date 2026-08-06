FROM python:3.12-slim

WORKDIR /usr/src/app

COPY requirements.txt ./
RUN python -m pip install --upgrade pip \
  && pip install -r requirements.txt

COPY . .

# Static assets do not require a database connection, so they can be prepared
# while the image is built. Database migrations run when the container starts.
RUN python manage.py collectstatic --no-input
RUN chmod +x ./start.sh

ENV PYTHONUNBUFFERED=1
EXPOSE 8000

CMD ["./start.sh"]
