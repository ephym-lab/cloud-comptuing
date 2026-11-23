# AWS setup

This guide prepares the AWS side of **S3 File Share**: a private, versioned S3 bucket, the CORS rule that lets the browser upload directly to it, and a least-privilege IAM user whose keys the backend uses to sign URLs.

Time needed: ~15 minutes. Everything here fits in the AWS Free Tier for a demo.

> **Never paste access keys into chat, commits, or screenshots.** They go only in `backend/.env`, which is git-ignored.

Throughout this guide, replace:

| Placeholder | Example |
|---|---|
| `YOUR-BUCKET-NAME` | `s3-file-share-demo-ada-7f3k` |
| `YOUR-REGION` | `eu-west-1` |

---

## How the app uses S3 (why each setting matters)

```
Browser ──(1) POST /api/files/upload-url──▶ Flask ── signs a presigned POST (no AWS call)
Browser ──(2) multipart POST ─────────────▶ S3     ── needs CORS (cross-origin from :3000)
Browser ──(3) POST /api/files/confirm ────▶ Flask ── head_object  → s3:GetObject
Browser ──(4) GET presigned URL ──────────▶ S3     ── <video>/<img> stream straight from S3
```

- **Block Public Access ON**: nothing is ever reachable without a signature. The "Try direct link" button in the demo proves it (*Access Denied*).
- **Versioning ON**: re-uploading the same filename keeps the old copy, which powers the version-history / restore feature.
- **CORS**: step 2 is a cross-origin request from `http://localhost:3000` to `*.amazonaws.com`, so the bucket must allow it.
- **IAM user**: the backend signs URLs with these keys. A presigned URL can only do what the signing identity is allowed to do, so least privilege here limits what any leaked URL could ever do.

---

## 1. Create the bucket

1. Open the **S3 console** → **Create bucket**.
2. **Bucket type**: General purpose.
3. **Bucket name**: `YOUR-BUCKET-NAME` (globally unique, lowercase letters, numbers and hyphens).
4. **AWS Region**: pick one close to you; this is `YOUR-REGION`. Write down the region **code** (e.g. `eu-west-1`), not the display name.
5. **Object Ownership**: *ACLs disabled (recommended)*.
6. **Block Public Access settings for this bucket**: leave **Block *all* public access** ✅ checked (all four boxes).
7. **Bucket Versioning**: **Enable**.
8. **Default encryption**: leave *Server-side encryption with Amazon S3 managed keys (SSE-S3)*.
9. Click **Create bucket**.

**Check:** open the bucket → **Properties** tab → *Bucket Versioning* shows **Enabled**. The **Permissions** tab shows *Block all public access: On*.

> Versioning can be suspended later but never fully turned off, so it's best to use a dedicated bucket for this demo.

---

## 2. Configure CORS

Bucket → **Permissions** tab → **Cross-origin resource sharing (CORS)** → **Edit**, paste, then **Save changes**:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000"],
    "AllowedMethods": ["POST", "GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

- `POST`: the browser upload (presigned POST).
- `GET` / `HEAD`: previews and downloads via presigned GET URLs.
- `ExposeHeaders: ETag` lets the frontend read the uploaded object's ETag.
- If you later serve the frontend from another origin (e.g. `https://files.example.com`), add it to `AllowedOrigins`. Avoid `"*"`.

---

## 3. Create the IAM user and policy

### 3a. Create the user

1. Open the **IAM console** → **Users** → **Create user**.
2. **User name**: `s3-file-share-app`.
3. Leave **Provide user access to the AWS Management Console** **unchecked**. This user is for the app only.
4. **Next** → *Permissions options*: choose **Attach policies directly**, but don't select any. Click **Next** → **Create user**.

### 3b. Attach a least-privilege inline policy

1. Open the new user → **Permissions** tab → **Add permissions** → **Create inline policy**.
2. Switch the editor to **JSON**, replace everything with the policy below (fix `YOUR-BUCKET-NAME` in **both** places), then **Next**.
3. **Policy name**: `s3-file-share-bucket-access` → **Create policy**.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListBucketAndVersions",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:ListBucketVersions"
      ],
      "Resource": "arn:aws:s3:::YOUR-BUCKET-NAME"
    },
    {
      "Sid": "ReadWriteObjects",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:GetObjectVersion",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::YOUR-BUCKET-NAME/*"
    }
  ]
}
```

What each permission is used for:

| Action | Resource | Used by |
|---|---|---|
| `s3:ListBucket` | bucket | `head_object` returning a clean 404 (instead of 403) for missing keys |
| `s3:ListBucketVersions` | bucket | Version history (`list_object_versions`) |
| `s3:GetObject` | objects | Presigned preview/download URLs, `head_object` on confirm |
| `s3:GetObjectVersion` | objects | Restoring an old version (reading the source version) |
| `s3:PutObject` | objects | Presigned POST uploads, restore (writes a new version) |
| `s3:DeleteObject` | objects | Delete (adds a delete marker; old versions remain) |

Note the two resources: bucket-level actions use the **bucket ARN**, and object-level actions use **`bucket/*`**. Mixing these up is the most common cause of `AccessDenied`.

There is deliberately no `s3:DeleteObjectVersion`, so the app **cannot permanently destroy** history. Only you, in the console, can.

### 3c. Create an access key

1. User → **Security credentials** tab → **Access keys** → **Create access key**.
2. **Use case**: *Application running outside AWS* → **Next** → (optional tag `s3-file-share demo`) → **Create access key**.
3. Copy the **Access key ID** and **Secret access key** straight into `backend/.env` (next step). The secret is shown **only once**.

---

## 4. Configure the backend

Edit `backend/.env` (yourself, locally):

```dotenv
AWS_ACCESS_KEY_ID=<access key id>
AWS_SECRET_ACCESS_KEY=<secret access key>
AWS_REGION=YOUR-REGION
S3_BUCKET_NAME=YOUR-BUCKET-NAME
```

Then recreate the backend container so it picks up the new values:

```bash
docker compose up -d --force-recreate backend
```

(Running the backend locally instead? Just restart `flask run`. `backend/.env` is loaded automatically.)

**Check:** log in to the app and upload a small image. In the S3 console you should see `users/<your-user-id>/images/<file>`. Then upload the same file again; the object's **Versions** tab (toggle *Show versions*) shows two versions.

---

## 5. Optional: lifecycle rule (talking point)

Lifecycle rules move or expire objects automatically, which is how real systems control storage cost.

Bucket → **Management** tab → **Create lifecycle rule**:

1. **Name**: `archive-after-30-days`. **Scope**: *Apply to all objects in the bucket* (acknowledge the warning).
2. **Lifecycle rule actions**: check
   - *Transition current versions of objects between storage classes* → **Glacier Flexible Retrieval** after **30** days.
   - *Permanently delete noncurrent versions of objects* → after **30** days (keeps version history from growing forever).
3. **Create rule**.

Equivalent JSON (e.g. for `aws s3api put-bucket-lifecycle-configuration`):

```json
{
  "Rules": [
    {
      "ID": "archive-after-30-days",
      "Status": "Enabled",
      "Filter": {},
      "Transitions": [{ "Days": 30, "StorageClass": "GLACIER" }],
      "NoncurrentVersionExpiration": { "NoncurrentDays": 30 }
    }
  ]
}
```

Points to make in the demo:

- **Cost**: S3 Standard ≈ $0.023/GB-month vs Glacier Flexible Retrieval ≈ $0.0036/GB-month (us-east-1; check current pricing). That's roughly 6× cheaper for cold data.
- **Trade-off**: Glacier Flexible Retrieval objects **can't be streamed directly**. They must be *restored* first (minutes to hours), so this app's preview would fail for archived files. *Glacier Instant Retrieval* keeps millisecond access at a higher price.
- Glacier classes have **minimum storage durations** (90 days for Flexible Retrieval) and per-request retrieval fees.
- In a quick demo nothing visibly happens: transitions run asynchronously, roughly once a day.

---

## 6. Cleanup after the demo

Do this when you're done so nothing keeps costing money and no live keys are left behind.

### 6a. Empty and delete the bucket

Because versioning is on, deleting the "files" isn't enough: old versions and delete markers remain and still count as storage.

1. S3 console → select the bucket → **Empty**. This deletes **all objects, all versions and all delete markers**. Type `permanently delete` to confirm.
2. Select the bucket → **Delete** → type the bucket name to confirm.

(First delete the lifecycle rule if you created one. It isn't required, but it keeps the steps tidy.)

### 6b. Deactivate and delete the access key

1. IAM → **Users** → `s3-file-share-app` → **Security credentials**.
2. Under **Access keys**: **Actions → Deactivate**, then **Actions → Delete**.
3. Delete the user itself: **Users** → select `s3-file-share-app` → **Delete** (this also removes its inline policy).

### 6c. Local cleanup

- Remove the `AWS_*` values from `backend/.env`.
- Optional: `docker compose down -v` deletes the local database volume (all users and file metadata).

### CLI alternative (optional)

If you have the AWS CLI configured with an **admin** profile (not the app user, which deliberately can't delete versions):

```bash
BUCKET=YOUR-BUCKET-NAME

# Delete every version and delete marker, then the bucket.
aws s3api list-object-versions --bucket "$BUCKET" \
  --query '{Objects: [Versions, DeleteMarkers][][].{Key: Key, VersionId: VersionId}}' \
  --output json > /tmp/versions.json
aws s3api delete-objects --bucket "$BUCKET" --delete file:///tmp/versions.json
aws s3api delete-bucket --bucket "$BUCKET"

# Remove the IAM user's key(s), inline policy and the user.
aws iam list-access-keys --user-name s3-file-share-app
aws iam delete-access-key --user-name s3-file-share-app --access-key-id <KEY_ID>
aws iam delete-user-policy --user-name s3-file-share-app --policy-name s3-file-share-bucket-access
aws iam delete-user --user-name s3-file-share-app
```

`delete-objects` handles up to 1,000 entries per call; for a demo bucket that's plenty. Otherwise use the console's **Empty** button.

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| API returns `storage_error`: *S3 is not configured* | `AWS_REGION` or `S3_BUCKET_NAME` is empty in `backend/.env`, or the container wasn't recreated. |
| Browser console: *blocked by CORS policy* on upload | CORS JSON missing, or the page origin isn't exactly `http://localhost:3000` (check port and `http` vs `https`). |
| Upload returns **403 AccessDenied** | Policy missing `s3:PutObject` on `bucket/*`, or the bucket name in the policy ARN is wrong. |
| Upload returns **403** with *Policy Condition failed* | File larger than `MAX_UPLOAD_MB` or a different Content-Type than was signed. This is the security policy working. |
| Upload returns **403** *Request has expired* | The presigned POST is valid for 5 minutes; request a new one. Also check your computer's clock. |
| `storage_error` with `InvalidAccessKeyId` / `SignatureDoesNotMatch` | Typo in the keys, stray spaces/quotes in `.env`, or the key was deactivated. |
| `storage_error` with `AccessDenied` on **Versions** | Missing `s3:ListBucketVersions` on the **bucket** ARN (not `bucket/*`). |
| `storage_error` with `NoSuchBucket` / `PermanentRedirect` | `AWS_REGION` doesn't match the bucket's actual region, or the bucket name is misspelled. |
| "Try direct link" shows the file instead of *Access Denied* | Block Public Access was turned off or a public bucket policy was added. Turn it back on. |
