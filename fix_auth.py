import sys

file_path = 'weentime-frontend/angular-weentime/src/app/core/interceptors/auth.interceptor.ts'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    '  if (token) {\n    clonedRequest = req.clone({\n      setHeaders: {\n        Authorization: Bearer ${token},\n      },\n    });\n  }',
    '  if (token && !req.headers.has(\'Authorization\')) {\n    clonedRequest = req.clone({\n      setHeaders: {\n        Authorization: Bearer ${token},\n      },\n    });\n  }'
)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print('auth.interceptor.ts updated')
