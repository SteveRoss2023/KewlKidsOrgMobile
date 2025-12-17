"""
Recipe import functionality - parse recipes from URLs.
"""
import requests
from bs4 import BeautifulSoup
from recipe_scrapers import scrape_me
from typing import Dict, List, Optional, Tuple
import json
import re
import os
from urllib.parse import urlparse
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
import logging

logger = logging.getLogger(__name__)


def import_recipe_from_url(url: str) -> Optional[Dict]:
    """
    Import a recipe from a URL.
    Returns a dictionary with recipe data or None if import fails.

    The import process:
    1. First tries recipe-scrapers library (supports many popular sites)
    2. Falls back to manual parsing with BeautifulSoup:
       - Looks for Schema.org structured data (JSON-LD)
       - Falls back to HTML parsing for common recipe patterns
    """
    import logging
    logger = logging.getLogger(__name__)

    try:
        # Try using recipe-scrapers first (supports many sites)
        logger.info(f"Attempting to import recipe from {url} using recipe-scrapers")
        scraper = scrape_me(url)

        title = scraper.title() or ''
        ingredients = scraper.ingredients() or []
        instructions = scraper.instructions_list() or []

        # Validate that we got at least some content
        if not title and not ingredients and not instructions:
            logger.warning(f"Recipe scraper returned empty data for URL: {url}, trying fallback")
            # Try fallback
            return _parse_recipe_manually(url)

        # Always fetch the page HTML to enhance title and image extraction
        soup = None
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
            response = requests.get(url, timeout=15, headers=headers)
            response.raise_for_status()
            soup = BeautifulSoup(response.content, 'html.parser')
            logger.info(f"Successfully fetched page HTML for {url}")
        except Exception as e:
            logger.warning(f"Failed to fetch page HTML for title/image extraction: {str(e)}")

        # DEBUG: Log what scraper returned
        logger.info(f"DEBUG: Scraper title: '{title}' (length: {len(title) if title else 0})")
        logger.info(f"DEBUG: Scraper ingredients count: {len(ingredients)}")
        logger.info(f"DEBUG: Scraper instructions count: {len(instructions)}")

        # Always try to extract title from the page, use it if better than scraper's title
        extracted_title = None
        if soup:
            extracted_title = _extract_title_from_soup(soup)
            logger.info(f"DEBUG: Extracted title from soup: '{extracted_title}'")

            if extracted_title and len(extracted_title.strip()) > 3:
                # Use extracted title if scraper's title is empty, too short, or generic
                if not title or len(title.strip()) < 3 or any(generic in title.lower() for generic in ['recipe', 'untitled', 'page not found', 'best of bridge']):
                    title = extracted_title
                    logger.info(f"Using extracted title '{title}' from page (scraper title was: '{scraper.title()}')")
                elif extracted_title != title:
                    logger.debug(f"Scraper title '{title}' differs from extracted '{extracted_title}', keeping scraper title")

        # Fallback: Extract title from URL if still no title
        if not title or len(title.strip()) < 3:
            url_title = _extract_title_from_url(url)
            if url_title:
                title = url_title
                logger.info(f"Using title extracted from URL: '{title}'")

        logger.info(f"DEBUG: Final title: '{title}'")

        # Get image from scraper first
        image_url = scraper.image() or None
        logger.info(f"DEBUG: Scraper image: '{image_url}'")

        # Always try to extract image from the page, use it if scraper didn't find one
        if soup:
            if not image_url:
                logger.info(f"No image from recipe-scrapers, trying manual extraction for {url}")
            else:
                logger.info(f"Found image from scraper, but will also check page for better image")

            extracted_image = _extract_image_from_soup(soup, url)
            logger.info(f"DEBUG: Extracted image from soup: '{extracted_image}'")

            # Use extracted image if scraper didn't find one, or if extracted image looks more relevant
            if extracted_image:
                if not image_url:
                    image_url = extracted_image
                    logger.info(f"Using extracted image from page: {image_url}")
                else:
                    # Keep scraper image for now, but log both
                    logger.info(f"Scraper found image: {image_url}, page found: {extracted_image} (keeping scraper image)")

        logger.info(f"Successfully imported recipe '{title}' using recipe-scrapers")

        recipe_data = {
            'title': title,
            'ingredients': ingredients,
            'instructions': instructions,
            'servings': _parse_servings(scraper.yields()),
            'prep_time_minutes': _parse_time(scraper.prep_time()),
            'cook_time_minutes': _parse_time(scraper.cook_time()),
            'image_url': image_url,  # Keep original URL for reference and fallback
            'source_url': url,
        }

        return recipe_data
    except Exception as e:
        logger.warning(f"Recipe scraper failed for URL {url}: {str(e)}")
        # Fallback to manual parsing with BeautifulSoup
        try:
            logger.info(f"Attempting manual parsing fallback for {url}")
            result = _parse_recipe_manually(url)
            if result:
                logger.info(f"Manual parsing result - Title: '{result.get('title', 'MISSING')}', Ingredients: {len(result.get('ingredients', []))}, Instructions: {len(result.get('instructions', []))}, Image: '{result.get('image_url', 'MISSING')}'")

                # If title is still missing or too short, try URL extraction
                if not result.get('title') or len(result.get('title', '').strip()) < 3:
                    url_title = _extract_title_from_url(url)
                    if url_title:
                        result['title'] = url_title
                        logger.info(f"Fixed title using URL extraction: '{url_title}'")

                logger.info(f"Final result - Title: '{result.get('title', 'MISSING')}'")
            else:
                logger.warning(f"Manual parsing returned no data for {url}")
            return result
        except Exception as e2:
            logger.error(f"Manual parsing also failed for URL {url}: {str(e2)}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            return None


def _parse_time(time_str: Optional[str]) -> Optional[int]:
    """Parse time string to minutes."""
    if not time_str:
        return None

    try:
        # Try to extract minutes from string like "30 minutes" or "1 hour"
        time_str = time_str.lower()
        if 'hour' in time_str or 'hr' in time_str:
            hours = int(''.join(filter(str.isdigit, time_str.split()[0])))
            return hours * 60
        elif 'minute' in time_str or 'min' in time_str:
            return int(''.join(filter(str.isdigit, time_str.split()[0])))
    except:
        pass

    return None


def _parse_recipe_manually(url: str) -> Optional[Dict]:
    """Fallback manual parsing using BeautifulSoup and schema.org."""
    import logging
    logger = logging.getLogger(__name__)

    try:
        # Use a user-agent to avoid being blocked
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        response = requests.get(url, timeout=15, headers=headers)
        response.raise_for_status()
        soup = BeautifulSoup(response.content, 'html.parser')

        # Try to find schema.org Recipe structured data
        recipe_json = soup.find('script', type='application/ld+json')
        if recipe_json:
            data = json.loads(recipe_json.string)
            if isinstance(data, list):
                data = data[0]

            if data.get('@type') == 'Recipe':
                image_url = _get_image_url(data)
                # If no image from schema.org, try HTML extraction
                if not image_url:
                    image_url = _extract_image_from_soup(soup, url)

                return {
                    'title': data.get('name', ''),
                    'ingredients': _extract_ingredients(data),
                    'instructions': _extract_instructions(data),
                    'servings': _parse_servings(data.get('recipeYield')),
                    'prep_time_minutes': _parse_iso_duration(data.get('prepTime')),
                    'cook_time_minutes': _parse_iso_duration(data.get('cookTime')),
                    'image_url': image_url,
                    'source_url': url,
                }

        # Fallback: try to extract basic info from HTML
        print(f"[RECIPE IMPORT] No Schema.org data found, trying HTML fallback for {url}")
        result = _parse_html_fallback(soup, url)

        print(f"[RECIPE IMPORT] HTML fallback result - Title: '{result.get('title') if result else 'None'}', Has ingredients: {bool(result and result.get('ingredients'))}, Has instructions: {bool(result and result.get('instructions'))}")

        # ALWAYS try URL-based title extraction and use it if it's better
        url_title = _extract_title_from_url(url)
        print(f"[RECIPE IMPORT] URL title extraction: '{url_title}'")

        if url_title:
            # Use URL title if HTML title is missing, too short, or clearly wrong (UI text, generic, etc.)
            current_title = result.get('title', '') if result else ''
            current_lower = current_title.lower()

            # List of obviously wrong titles (UI elements, modals, etc.)
            wrong_titles = ['insert/edit link', 'edit link', 'insert link', 'link', 'untitled', 'recipe',
                          'best of bridge', 'the best of bridge', 'page not found', 'error', 'loading',
                          'close', 'cancel', 'submit', 'save', 'delete', 'edit', 'view original']

            # Check if current title is obviously wrong
            is_wrong_title = (not current_title or
                            len(current_title.strip()) < 3 or
                            any(wrong in current_lower for wrong in wrong_titles) or
                            current_lower.startswith('insert') or
                            current_lower.startswith('edit') or
                            'link' in current_lower)

            if is_wrong_title:
                if result:
                    result['title'] = url_title
                else:
                    result = {'title': url_title, 'ingredients': [], 'instructions': [], 'image_url': None, 'source_url': url}
                print(f"[RECIPE IMPORT] ✓ Using URL title: '{url_title}' (HTML title '{current_title}' was rejected as UI text)")
            else:
                print(f"[RECIPE IMPORT] Keeping HTML title: '{current_title}' (URL title was: '{url_title}')")

        # If no result at all, try URL-based title as last resort
        if not result:
            logger.warning(f"HTML fallback returned no result, trying URL-based title extraction")
            url_title = _extract_title_from_url(url)
            if url_title:
                logger.info(f"Creating minimal result with URL title: '{url_title}'")
                # Try to get at least ingredients/instructions from the page
                ingredients = []
                instructions = []
                # Quick extraction attempt
                for heading in soup.find_all(['h2', 'h3', 'h4'], limit=10):
                    text = heading.get_text().lower().strip()
                    if 'ingredient' in text:
                        # Find list after this heading
                        for sibling in heading.find_next_siblings(limit=5):
                            if sibling.name in ['ul', 'ol']:
                                for li in sibling.find_all('li'):
                                    ing = li.get_text().strip()
                                    if ing and len(ing) > 2:
                                        ingredients.append(ing)
                                if ingredients:
                                    break
                        if ingredients:
                            break

                if ingredients or instructions:
                    result = {
                        'title': url_title,
                        'ingredients': ingredients,
                        'instructions': instructions,
                        'image_url': _extract_image_from_soup(soup, url),
                        'source_url': url,
                    }
                    logger.info(f"Created result with URL title and extracted content")

        return result
    except Exception as e:
        logger.warning(f"Manual parsing failed for {url}: {str(e)}")
        return None


def _extract_ingredients(data: Dict) -> List[str]:
    """Extract ingredients from schema.org data."""
    ingredients = data.get('recipeIngredient', [])
    if isinstance(ingredients, str):
        return [ingredients]
    return ingredients if isinstance(ingredients, list) else []


def _extract_instructions(data: Dict) -> List[str]:
    """Extract instructions from schema.org data."""
    instructions = data.get('recipeInstructions', [])
    if isinstance(instructions, str):
        return [instructions]

    result = []
    for item in instructions:
        if isinstance(item, dict):
            if item.get('@type') == 'HowToStep':
                result.append(item.get('text', ''))
            elif 'text' in item:
                result.append(item['text'])
        elif isinstance(item, str):
            result.append(item)

    return result


def _parse_servings(yield_str: Optional[str]) -> Optional[int]:
    """Parse servings from yield string."""
    if not yield_str:
        return None
    try:
        # Extract first number
        import re
        match = re.search(r'\d+', str(yield_str))
        if match:
            return int(match.group())
    except:
        pass
    return None


def _parse_iso_duration(duration_str: Optional[str]) -> Optional[int]:
    """Parse ISO 8601 duration to minutes."""
    if not duration_str:
        return None

    try:
        # Parse PT30M format
        import re
        hours = 0
        minutes = 0

        hour_match = re.search(r'(\d+)H', duration_str.upper())
        if hour_match:
            hours = int(hour_match.group(1))

        min_match = re.search(r'(\d+)M', duration_str.upper())
        if min_match:
            minutes = int(min_match.group(1))

        return hours * 60 + minutes
    except:
        return None


def _get_image_url(data: Dict) -> Optional[str]:
    """Extract image URL from schema.org data."""
    image = data.get('image')
    if isinstance(image, str):
        return image
    elif isinstance(image, dict):
        # Could be ImageObject with url property
        return image.get('url') or image.get('contentUrl') or image.get('@id')
    elif isinstance(image, list) and image:
        # Get first image from list
        img = image[0]
        if isinstance(img, str):
            return img
        elif isinstance(img, dict):
            return img.get('url') or img.get('contentUrl') or img.get('@id')

    # Also check for thumbnailUrl
    thumbnail = data.get('thumbnailUrl')
    if thumbnail:
        return thumbnail

    return None


def _extract_title_from_url(url: str) -> Optional[str]:
    """Extract recipe title from URL path (e.g., /chili-cheese-dogs/ -> 'Chili Cheese Dogs')."""
    from urllib.parse import urlparse, unquote
    import re

    try:
        parsed = urlparse(url)
        path = parsed.path.strip('/')
        print(f"[RECIPE IMPORT] Extracting title from URL path: '{path}'")

        # Remove common prefixes/suffixes
        path = path.replace('/recipes/', '').replace('/recipe/', '').replace('/recipe/', '')

        # Get the last segment (usually the recipe name)
        segments = [s for s in path.split('/') if s]
        print(f"[RECIPE IMPORT] URL segments: {segments}")
        if segments:
            last_segment = segments[-1]
            # Remove file extensions
            last_segment = last_segment.rsplit('.', 1)[0]
            # URL decode
            last_segment = unquote(last_segment)
            print(f"[RECIPE IMPORT] Last segment after decode: '{last_segment}'")
            # Convert hyphens/underscores to spaces and title case
            title = re.sub(r'[-_]', ' ', last_segment)
            title = ' '.join(word.capitalize() for word in title.split())

            print(f"[RECIPE IMPORT] Final URL title: '{title}'")
            if title and len(title) > 3:
                return title
    except Exception as e:
        print(f"[RECIPE IMPORT] Failed to extract title from URL: {str(e)}")

    return None


def _extract_title_from_soup(soup: BeautifulSoup) -> Optional[str]:
    """Extract recipe title from BeautifulSoup object using multiple methods."""
    import logging
    logger = logging.getLogger(__name__)

    title = None

    # Method 1: Try h1 tags (most common)
    for h1 in soup.find_all('h1'):
        text = h1.get_text().strip()
        if text and len(text) > 3:
            text_lower = text.lower()
            # Skip generic titles and UI elements
            skip_patterns = ['home', 'recipe', 'recipes', 'cookbook', 'menu', 'best of bridge',
                           'insert', 'edit', 'link', 'close', 'cancel', 'submit']
            if not any(skip in text_lower for skip in skip_patterns):
                title = text
                print(f"[RECIPE IMPORT] ✓ Found title from h1: '{title}'")
                logger.debug(f"Found title from h1: {title}")
                break

    # Method 2: Try h2 tags if no h1 (h2 is common for recipe titles on some sites like bestofbridge.com)
    if not title:
        h2_tags = soup.find_all('h2')
        print(f"[RECIPE IMPORT] Found {len(h2_tags)} h2 tags for title extraction")
        for idx, h2 in enumerate(h2_tags):
            text = h2.get_text().strip()
            print(f"[RECIPE IMPORT] h2[{idx}]: '{text}' (length: {len(text)})")
            if text and len(text) > 3:
                text_lower = text.lower()
                # Skip obvious section headers
                skip_patterns = ['ingredients', 'instructions', 'directions', 'nutrition', 'comments', 'related', 'you may also like', 'share', 'print', 'notes', 'serves', 'prep time', 'cook time', 'total time', 'this is a great', 'first, make']

                # For the FIRST h2, be very lenient - it's likely the recipe title
                if idx == 0:
                    # Only skip if it's clearly a section header (starts with skip words or is very short)
                    first_word = text_lower.split()[0] if text_lower.split() else ''
                    print(f"[RECIPE IMPORT] First h2 first word: '{first_word}', length: {len(text)}")
                    if len(text) > 5 and first_word not in ['ingredients', 'instructions', 'directions', 'notes', 'serves', 'first']:
                        title = text
                        print(f"[RECIPE IMPORT] ✓ Found title from FIRST h2: '{title}'")
                        break

                # For other h2s, check skip patterns
                if not any(skip in text_lower for skip in skip_patterns):
                    title = text
                    print(f"[RECIPE IMPORT] ✓ Found title from h2[{idx}]: '{title}'")
                    break

    # Method 3: Try meta tags
    if not title:
        og_title = soup.find('meta', property='og:title')
        if og_title and og_title.get('content'):
            title_text = og_title.get('content').strip()
            # Skip UI elements in meta tags too
            if not any(skip in title_text.lower() for skip in ['insert', 'edit', 'link', 'untitled']):
                title = title_text
                print(f"[RECIPE IMPORT] ✓ Found title from og:title: '{title}'")
                logger.debug(f"Found title from og:title: {title}")

    # Method 4: Try title tag and clean it up
    if not title:
        title_tag = soup.find('title')
        if title_tag:
            title_text = title_tag.get_text().strip()
            # Skip if it's clearly UI text
            if any(skip in title_text.lower() for skip in ['insert', 'edit', 'link', 'untitled']):
                print(f"[RECIPE IMPORT] Skipping title tag (UI text): '{title_text}'")
            else:
                # Remove common suffixes like " | Best of Bridge" or " - Recipe" or "Recipe |"
                # Split by common separators and take the first meaningful part
                parts = title_text.replace('|', ' - ').split(' - ')
                for part in parts:
                    part = part.strip()
                    # Skip generic parts
                    if part and len(part) > 3 and not any(skip in part.lower() for skip in ['recipe', 'recipes', 'best of bridge', 'cookbook', 'insert', 'edit', 'link']):
                        title = part
                        print(f"[RECIPE IMPORT] ✓ Found title from title tag: '{title}'")
                        logger.debug(f"Found title from title tag: {title}")
                        break

    # Method 5: Look for article header or entry-title
    if not title:
        article_header = soup.find(['header', 'div'], class_=lambda x: x and any(keyword in str(x).lower() for keyword in ['title', 'header', 'entry-title', 'recipe-title', 'post-title']))
        if article_header:
            for h in article_header.find_all(['h1', 'h2', 'h3']):
                text = h.get_text().strip()
                if text and len(text) > 3:
                    title = text
                    logger.debug(f"Found title from article header: {title}")
                    break

    # Method 6: Look for main content area with title
    if not title:
        main_content = soup.find(['main', 'article', 'div'], class_=lambda x: x and any(keyword in str(x).lower() for keyword in ['content', 'main', 'recipe', 'post']))
        if main_content:
            # Find first heading in main content
            for h in main_content.find_all(['h1', 'h2', 'h3'], limit=3):
                text = h.get_text().strip()
                if text and len(text) > 3:
                    if not any(skip in text.lower() for skip in ['ingredients', 'instructions', 'directions', 'nutrition', 'comments']):
                        title = text
                        logger.debug(f"Found title from main content: {title}")
                        break

    return title


def _extract_image_from_soup(soup: BeautifulSoup, url: str) -> Optional[str]:
    """Extract image URL from BeautifulSoup object using multiple methods."""
    import logging
    from urllib.parse import urljoin, urlparse, urlunparse
    logger = logging.getLogger(__name__)

    image_url = None

    # Method 0: PRIORITY - Look for custom-recipe-header-image div (bestofbridge.com specific)
    custom_header_div = soup.find('div', class_=lambda x: x and ('custom-recipe-header-image' in str(x).lower() or 'recipe-header-image' in str(x).lower()))
    if custom_header_div:
        style = custom_header_div.get('style', '')
        if style and 'background-image' in style.lower() and 'url(' in style.lower():
            url_match = re.search(r'url\(["\']?([^"\'()]+)["\']?\)', style, re.IGNORECASE)
            if url_match:
                bg_image_url = url_match.group(1).strip()
                if bg_image_url and not bg_image_url.startswith('data:'):
                    image_url = _normalize_image_url(bg_image_url, url)
                    print(f"[RECIPE IMPORT] ✓ Found custom-recipe-header-image (PRIORITY): {image_url}")
                    return image_url

    # Method 1: Open Graph image (og:image)
    og_image = soup.find('meta', property='og:image')
    if og_image and og_image.get('content'):
        image_url = og_image.get('content')
        logger.debug(f"Found image from og:image: {image_url}")
        if image_url:
            image_url = _normalize_image_url(image_url, url)
            return image_url

    # Method 2: Twitter card image
    twitter_image = soup.find('meta', attrs={'name': 'twitter:image'})
    if twitter_image and twitter_image.get('content'):
        image_url = twitter_image.get('content')
        logger.debug(f"Found image from twitter:image: {image_url}")
        if image_url:
            image_url = _normalize_image_url(image_url, url)
            return image_url

    # Method 3: Schema.org image in JSON-LD
    json_ld_scripts = soup.find_all('script', type='application/ld+json')
    for script in json_ld_scripts:
        try:
            data = json.loads(script.string)
            if isinstance(data, list):
                data = data[0]
            if isinstance(data, dict):
                image_url = _get_image_url(data)
                if image_url:
                    logger.debug(f"Found image from Schema.org: {image_url}")
                    image_url = _normalize_image_url(image_url, url)
                    return image_url
        except (json.JSONDecodeError, KeyError, TypeError):
            continue

    # Method 4: Look for images with recipe-related class names or IDs
    recipe_image_selectors = [
        ('img', {'class': lambda x: x and any(keyword in str(x).lower() for keyword in ['recipe', 'food', 'dish', 'main-image', 'featured', 'hero'])}),
        ('img', {'id': lambda x: x and any(keyword in str(x).lower() for keyword in ['recipe', 'food', 'dish', 'main-image', 'featured', 'hero'])}),
    ]

    for tag, attrs in recipe_image_selectors:
        images = soup.find_all(tag, attrs)
        logger.debug(f"Found {len(images)} images with recipe-related classes/IDs")
        for img in images:
            src = img.get('src') or img.get('data-src') or img.get('data-lazy-src') or img.get('data-original')
            if src:
                # Skip very small images (likely icons) and data URIs
                if not src.startswith('data:') and not any(skip in src.lower() for skip in ['icon', 'logo', 'avatar', 'thumb', 'placeholder', 'spinner', 'loading']):
                    # Check image dimensions if available
                    width = img.get('width')
                    height = img.get('height')
                    if width and height:
                        try:
                            w, h = int(width), int(height)
                            # Skip very small images (likely icons)
                            if w < 100 or h < 100:
                                logger.debug(f"Skipping small image: {src} ({w}x{h})")
                                continue
                        except (ValueError, TypeError):
                            pass

                    image_url = _normalize_image_url(src, url)
                    logger.info(f"Found image from recipe-related img tag: {image_url}")
                    return image_url

    # Method 5: Look for images near the title (first image after h1/h2) - PRIORITY METHOD
    print(f"[RECIPE IMPORT] Looking for images near recipe title headings...")
    recipe_title_heading = None
    ingredients_heading = None

    # First, find the recipe title heading and ingredients heading
    for heading in soup.find_all(['h1', 'h2', 'h3'], limit=10):
        heading_text = heading.get_text().strip().lower()
        if 'ingredient' in heading_text and not ingredients_heading:
            ingredients_heading = heading
            print(f"[RECIPE IMPORT] Found ingredients heading at position")
        elif not recipe_title_heading and len(heading_text) > 5:
            # Skip section headers
            if not any(skip in heading_text for skip in ['ingredients', 'instructions', 'directions', 'nutrition', 'notes', 'insert', 'edit', 'link', 'you may also like', 'related']):
                recipe_title_heading = heading
                print(f"[RECIPE IMPORT] Found recipe title heading: '{heading.get_text().strip()}'")
                break

    # Look for images between the title and ingredients (recipe content area) - GET THE FIRST ONE
    if recipe_title_heading and ingredients_heading:
        print(f"[RECIPE IMPORT] Looking for FIRST image between title and ingredients...")
        current = recipe_title_heading.find_next_sibling()
        while current and current != ingredients_heading:
            if current.name == 'div':
                # GENERAL STRATEGY: Check for recipe-related classes with background-image
                # We maintain a list of common patterns and add more as we encounter sites
                classes = current.get('class', [])
                class_str = ' '.join(classes) if isinstance(classes, list) else str(classes)
                class_lower = class_str.lower()

                # Common recipe image class patterns (expand this list as we find new sites)
                recipe_image_class_patterns = [
                    'recipe-header-image',      # bestofbridge.com
                    'custom-recipe-header-image',  # bestofbridge.com
                    'recipe-image',
                    'recipe-featured-image',
                    'recipe-photo',
                    'recipe-main-image',
                    'featured-image',
                    'hero-image',
                    'recipe-hero'
                ]

                # Check if this div has a recipe-related class
                has_recipe_class = any(pattern in class_lower for pattern in recipe_image_class_patterns)

                # Check for background-image in style attribute
                style = current.get('style', '')
                if style and 'background-image' in style.lower() and 'url(' in style.lower():
                    url_match = re.search(r'url\(["\']?([^"\'()]+)["\']?\)', style, re.IGNORECASE)
                    if url_match:
                        bg_image_url = url_match.group(1).strip()
                        if bg_image_url and not bg_image_url.startswith('data:'):
                            if has_recipe_class:
                                image_url = _normalize_image_url(bg_image_url, url)
                                print(f"[RECIPE IMPORT] ✓ Found background-image with recipe class: {image_url} (class: {class_str})")
                                return image_url
                            # Even without recipe class, if it's between title and ingredients, use it
                            image_url = _normalize_image_url(bg_image_url, url)
                            print(f"[RECIPE IMPORT] ✓ Found FIRST background-image between title and ingredients: {image_url}")
                            return image_url

                # Get the FIRST img tag in this container
                img = current.find('img')
                if img:
                    src = img.get('src') or img.get('data-src') or img.get('data-lazy-src') or img.get('data-original')
                    if src and not src.startswith('data:') and not any(skip in src.lower() for skip in ['icon', 'logo', 'avatar', 'placeholder', 'background']):
                        image_url = _normalize_image_url(src, url)
                        print(f"[RECIPE IMPORT] ✓ Found FIRST image in container between title and ingredients: {image_url}")
                        return image_url
            elif current.name == 'img':
                src = current.get('src') or current.get('data-src') or current.get('data-lazy-src') or current.get('data-original')
                if src and not src.startswith('data:') and not any(skip in src.lower() for skip in ['icon', 'logo', 'avatar', 'placeholder', 'background']):
                    image_url = _normalize_image_url(src, url)
                    print(f"[RECIPE IMPORT] ✓ Found FIRST image between title and ingredients: {image_url}")
                    return image_url
            current = current.find_next_sibling()

    # Fallback: Look for images near the title heading itself
    if recipe_title_heading:
        print(f"[RECIPE IMPORT] Checking heading: '{recipe_title_heading.get_text().strip()}'")
        parent = recipe_title_heading.find_parent()
        if parent:
            # Check for background-image in parent container FIRST
            style = parent.get('style', '')
            if style and 'background-image' in style.lower() and 'url(' in style.lower():
                url_match = re.search(r'url\(["\']?([^"\'()]+)["\']?\)', style, re.IGNORECASE)
                if url_match:
                    bg_image_url = url_match.group(1).strip()
                    if bg_image_url and not bg_image_url.startswith('data:'):
                        image_url = _normalize_image_url(bg_image_url, url)
                        print(f"[RECIPE IMPORT] ✓ Found background-image in title parent: {image_url}")
                        return image_url

            # Check for images in the same container
            img = parent.find('img')
            if img:
                src = img.get('src') or img.get('data-src') or img.get('data-lazy-src') or img.get('data-original')
                if src and not src.startswith('data:') and not any(skip in src.lower() for skip in ['icon', 'logo', 'avatar', 'placeholder']):
                    image_url = _normalize_image_url(src, url)
                    print(f"[RECIPE IMPORT] ✓ Found image in title container: {image_url}")
                    return image_url

            # Check next siblings
            for sibling in recipe_title_heading.find_next_siblings(limit=10):
                if sibling == ingredients_heading:
                    break  # Stop at ingredients
                if sibling.name == 'img':
                    src = sibling.get('src') or sibling.get('data-src') or sibling.get('data-lazy-src') or sibling.get('data-original')
                    if src and not src.startswith('data:') and not any(skip in src.lower() for skip in ['icon', 'logo', 'avatar', 'placeholder']):
                        image_url = _normalize_image_url(src, url)
                        print(f"[RECIPE IMPORT] ✓ Found image in sibling of title: {image_url}")
                        return image_url
                elif sibling.name in ['div', 'figure', 'picture']:
                    # Check for background-image FIRST
                    style = sibling.get('style', '')
                    if style and 'background-image' in style.lower() and 'url(' in style.lower():
                        url_match = re.search(r'url\(["\']?([^"\'()]+)["\']?\)', style, re.IGNORECASE)
                        if url_match:
                            bg_image_url = url_match.group(1).strip()
                            if bg_image_url and not bg_image_url.startswith('data:'):
                                image_url = _normalize_image_url(bg_image_url, url)
                                print(f"[RECIPE IMPORT] ✓ Found background-image in sibling near title: {image_url}")
                                return image_url

                    img = sibling.find('img')
                    if img:
                        src = img.get('src') or img.get('data-src') or img.get('data-lazy-src') or img.get('data-original')
                        if src and not src.startswith('data:') and not any(skip in src.lower() for skip in ['icon', 'logo', 'avatar', 'placeholder']):
                            image_url = _normalize_image_url(src, url)
                            print(f"[RECIPE IMPORT] ✓ Found image in container near title: {image_url}")
                            return image_url


    # Method 6: LAST RESORT - Get the FIRST image in main content (but avoid header/nav images)
    # Only use this if we didn't find anything between title and ingredients
    main_content = soup.find(['main', 'article', 'div'], class_=lambda x: x and any(keyword in str(x).lower() for keyword in ['content', 'main', 'recipe', 'post', 'entry']))
    if main_content:
        images = main_content.find_all('img')
        print(f"[RECIPE IMPORT] Fallback: Found {len(images)} images in main content, getting FIRST one")

        # Get the FIRST image that's not in header/nav/sidebar
        for img in images:
            # Skip if image is in header/nav/sidebar
            parent = img.find_parent(['header', 'nav', 'aside'])
            if parent:
                continue

            src = img.get('src') or img.get('data-src') or img.get('data-lazy-src') or img.get('data-original')
            if src and not src.startswith('data:'):
                # Skip icons, logos, avatars, placeholders
                src_lower = src.lower()
                if any(skip in src_lower for skip in ['icon', 'logo', 'avatar', 'thumb', 'placeholder', 'spinner', 'loading', 'banner', 'header', 'background']):
                    continue

                # Check alt text - skip if it's clearly not a recipe image
                alt = img.get('alt', '').lower()
                if any(skip in alt for skip in ['logo', 'icon', 'banner', 'header', 'navigation', 'menu']):
                    continue

                # Check if parent div has background-image style
                parent_div = img.find_parent('div')
                if parent_div:
                    style = parent_div.get('style', '')
                    if 'background' in style.lower() and 'url' in style.lower():
                        continue

                # TAKE THE FIRST ONE - no size checking
                image_url = _normalize_image_url(src, url)
                print(f"[RECIPE IMPORT] ✓ Fallback: Selected FIRST image from main content: {image_url}")
                return image_url

    return None


def download_and_save_image(image_url: str, recipe_id: Optional[int] = None) -> Optional[str]:
    """
    Download an image from a URL and save it to Django's media storage.
    
    Args:
        image_url: The URL of the image to download
        recipe_id: Optional recipe ID to use in the filename
        
    Returns:
        The relative path to the saved image (e.g., 'recipes/images/recipe_123.jpg')
        or None if download fails
    """
    if not image_url:
        return None
    
    try:
        # Normalize the URL
        if not image_url.startswith(('http://', 'https://')):
            # If relative URL, make it absolute using a base URL
            logger.warning(f"Image URL is not absolute: {image_url}")
            return None
        
        # Download the image
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
            'Referer': image_url.split('/')[0] + '//' + image_url.split('/')[2] if '/' in image_url else '',
        }
        
        response = requests.get(image_url, timeout=30, headers=headers, stream=True)
        response.raise_for_status()
        
        # Check if it's actually an image
        content_type = response.headers.get('Content-Type', '')
        if not content_type.startswith('image/'):
            logger.warning(f"URL does not point to an image: {content_type}")
            return None
        
        # Get file extension from URL or content type
        parsed_url = urlparse(image_url)
        path = parsed_url.path
        ext = os.path.splitext(path)[1].lower().lstrip('.')
        
        # If no extension, try to get from content type
        if not ext:
            content_type_map = {
                'image/jpeg': 'jpg',
                'image/jpg': 'jpg',
                'image/png': 'png',
                'image/gif': 'gif',
                'image/webp': 'webp',
            }
            ext = content_type_map.get(content_type.split(';')[0].strip(), 'jpg')
        
        # Generate filename
        if recipe_id:
            filename = f'recipes/images/recipe_{recipe_id}.{ext}'
        else:
            # Use a temporary filename that will be renamed when recipe is saved
            import time
            filename = f'recipes/images/temp_{int(time.time())}.{ext}'
        
        # Save the image
        image_content = response.content
        saved_path = default_storage.save(filename, ContentFile(image_content))
        
        logger.info(f"Successfully downloaded and saved image: {saved_path}")
        return saved_path
        
    except Exception as e:
        logger.error(f"Failed to download image from {image_url}: {str(e)}")
        return None


def _normalize_image_url(image_url: str, base_url: str) -> str:
    """Normalize image URL: convert relative to absolute, remove query params."""
    from urllib.parse import urljoin, urlparse, urlunparse

    # Convert relative URL to absolute
    if not image_url.startswith(('http://', 'https://')):
        image_url = urljoin(base_url, image_url)

    # Remove query parameters (some sites add tracking params)
    parsed = urlparse(image_url)
    # Keep the path but remove query and fragment
    normalized = urlunparse((parsed.scheme, parsed.netloc, parsed.path, '', '', ''))

    return normalized


def _parse_html_fallback(soup: BeautifulSoup, url: str) -> Optional[Dict]:
    """Fallback HTML parsing when schema.org is not available."""
    import logging
    logger = logging.getLogger(__name__)

    try:
        # Extract title using the dedicated function
        title = _extract_title_from_soup(soup)
        print(f"[RECIPE IMPORT] Extracted title from HTML: '{title}'")

        # Try to find ingredients - look for common patterns
        ingredients = []

        # Method 1: Look for ingredients section with list items (case-insensitive search)
        ingredients_section = soup.find(string=lambda text: text and text.strip() and 'ingredient' in text.lower())
        if ingredients_section:
            parent = ingredients_section.find_parent()
            if parent:
                # Look for lists in the same parent or nearby
                for ul in parent.find_all(['ul', 'ol'], recursive=False):
                    for li in ul.find_all('li', recursive=False):
                        ingredient_text = li.get_text().strip()
                        if ingredient_text and not any(skip in ingredient_text.lower() for skip in ['rate', 'pin', 'print', 'save', 'comment', 'share', 'email']):
                            ingredients.append(ingredient_text)

                # Also check next siblings for lists
                if not ingredients:
                    for sibling in parent.find_next_siblings(limit=5):
                        if sibling.name in ['ul', 'ol']:
                            for li in sibling.find_all('li'):
                                ingredient_text = li.get_text().strip()
                                if ingredient_text and not any(skip in ingredient_text.lower() for skip in ['rate', 'pin', 'print', 'save', 'comment', 'share', 'email']):
                                    ingredients.append(ingredient_text)
                            if ingredients:
                                break

        # Method 2: Look for lists near "Ingredients" heading (more flexible)
        if not ingredients:
            print(f"[RECIPE IMPORT] Looking for ingredients near 'Ingredients' heading...")
            for heading in soup.find_all(['h2', 'h3', 'h4', 'h5', 'strong', 'b', 'div']):
                heading_text = heading.get_text().lower().strip()
                if 'ingredient' in heading_text and len(heading_text) < 50:  # Reasonable heading length
                    print(f"[RECIPE IMPORT] Found ingredients heading: '{heading.get_text().strip()}'")
                    # Find next list or div with list
                    for sibling in heading.find_next_siblings(limit=10):
                        if sibling.name in ['ul', 'ol']:
                            for li in sibling.find_all('li'):
                                ingredient_text = li.get_text().strip()
                                if ingredient_text and len(ingredient_text) > 2:
                                    ingredients.append(ingredient_text)
                            if ingredients:
                                print(f"[RECIPE IMPORT] Found {len(ingredients)} ingredients from list after heading")
                                break
                        elif sibling.name == 'div':
                            # Check if div contains a list
                            for ul in sibling.find_all(['ul', 'ol'], recursive=True):
                                for li in ul.find_all('li'):
                                    ingredient_text = li.get_text().strip()
                                    if ingredient_text and len(ingredient_text) > 2:
                                        ingredients.append(ingredient_text)
                                if ingredients:
                                    print(f"[RECIPE IMPORT] Found {len(ingredients)} ingredients from div list")
                                    break
                            if ingredients:
                                break
                    if ingredients:
                        print(f"[RECIPE IMPORT] First few ingredients: {ingredients[:3]}")
                        break

        # Method 3: Look for divs with class names containing "ingredient"
        if not ingredients:
            for div in soup.find_all('div', class_=lambda x: x and 'ingredient' in x.lower()):
                for li in div.find_all('li'):
                    ingredient_text = li.get_text().strip()
                    if ingredient_text and len(ingredient_text) > 2:
                        ingredients.append(ingredient_text)
                    if ingredients:
                        break

        # Try to find instructions
        instructions = []

        # Method 1: Look for instructions section (case-insensitive)
        instructions_section = soup.find(string=lambda text: text and text.strip() and ('instruction' in text.lower() or 'direction' in text.lower() or 'step' in text.lower() or 'method' in text.lower()))
        if instructions_section:
            parent = instructions_section.find_parent()
            if parent:
                for ol in parent.find_all(['ol', 'ul'], recursive=False):
                    for li in ol.find_all('li', recursive=False):
                        instruction_text = li.get_text().strip()
                        if instruction_text and len(instruction_text) > 10:
                            instructions.append(instruction_text)

                # Also check next siblings
                if not instructions:
                    for sibling in parent.find_next_siblings(limit=5):
                        if sibling.name in ['ol', 'ul']:
                            for li in sibling.find_all('li'):
                                instruction_text = li.get_text().strip()
                                if instruction_text and len(instruction_text) > 10:
                                    instructions.append(instruction_text)
                            if instructions:
                                break

        # Method 2: Look for instructions near headings (more flexible)
        if not instructions:
            for heading in soup.find_all(['h2', 'h3', 'h4', 'h5', 'strong', 'b', 'div']):
                heading_text = heading.get_text().lower().strip()
                if any(keyword in heading_text for keyword in ['instruction', 'direction', 'step', 'how to', 'method', 'preparation']) and len(heading_text) < 50:
                    # Find next list or div with steps
                    for sibling in heading.find_next_siblings(limit=10):
                        if sibling.name == 'ol':
                            for li in sibling.find_all('li'):
                                instruction_text = li.get_text().strip()
                                if instruction_text and len(instruction_text) > 10:
                                    instructions.append(instruction_text)
                            if instructions:
                                break
                        elif sibling.name == 'ul':
                            # Sometimes instructions are in unordered lists
                            for li in sibling.find_all('li'):
                                instruction_text = li.get_text().strip()
                                if instruction_text and len(instruction_text) > 20:
                                    instructions.append(instruction_text)
                            if instructions:
                                break
                        elif sibling.name == 'div':
                            # Look for numbered steps, paragraphs, or nested lists
                            for p in sibling.find_all(['p', 'div'], recursive=True):
                                text = p.get_text().strip()
                                if text and len(text) > 20:
                                    instructions.append(text)
                            # Also check for lists within the div
                            for ol in sibling.find_all(['ol', 'ul'], recursive=True):
                                for li in ol.find_all('li'):
                                    instruction_text = li.get_text().strip()
                                    if instruction_text and len(instruction_text) > 10:
                                        instructions.append(instruction_text)
                            if instructions:
                                break
                    if instructions:
                        break

        # Method 3: Look for divs with class names containing "instruction" or "step"
        if not instructions:
            for div in soup.find_all('div', class_=lambda x: x and any(keyword in x.lower() for keyword in ['instruction', 'direction', 'step', 'method'])):
                # Check for paragraphs first
                for p in div.find_all('p'):
                    text = p.get_text().strip()
                    if text and len(text) > 20:
                        instructions.append(text)
                # Then check for lists
                if not instructions:
                    for li in div.find_all('li'):
                        instruction_text = li.get_text().strip()
                        if instruction_text and len(instruction_text) > 10:
                            instructions.append(instruction_text)
                if instructions:
                    break

        # Extract image using the dedicated function
        image_url = _extract_image_from_soup(soup, url)

        # ALWAYS try URL-based title as fallback
        if not title or len(title.strip()) < 3:
            url_title = _extract_title_from_url(url)
            print(f"[RECIPE IMPORT] No HTML title, trying URL: '{url_title}'")
            if url_title:
                title = url_title
                print(f"[RECIPE IMPORT] Using URL title in HTML fallback: '{title}'")

        print(f"[RECIPE IMPORT] Final title: '{title}', Ingredients count: {len(ingredients)}, Instructions count: {len(instructions)}")

        # Only return if we have at least title and some content
        if title and (ingredients or instructions):
            return {
                'title': title,
                'ingredients': ingredients,
                'instructions': instructions,
                'servings': None,
                'prep_time_minutes': None,
                'cook_time_minutes': None,
                'image_url': image_url,
                'source_url': url,
            }

        logger.warning(f"HTML fallback parsing found title but no ingredients or instructions for URL: {url}")
        return None
    except Exception as e:
        logger.error(f"HTML fallback parsing failed: {str(e)}")
        return None


def _parse_ingredient_name(ingredient_str: str) -> str:
    """
    Parse ingredient string to extract just the ingredient name.
    Removes quantities and units (e.g., "3/4 pound linguine" -> "linguine").

    Args:
        ingredient_str: Raw ingredient string from recipe

    Returns:
        Clean ingredient name without quantity/unit
    """
    import logging
    logger = logging.getLogger(__name__)

    if not ingredient_str or not isinstance(ingredient_str, str):
        return ingredient_str.strip() if ingredient_str else ''

    ingredient = ingredient_str.strip()
    logger.debug(f"Parsing ingredient: '{ingredient}'")

    # Normalize fraction slash (⁄ U+2044) to regular slash for easier parsing
    ingredient = ingredient.replace('⁄', '/')

    # First, normalize Unicode fractions to regular fractions
    # Common Unicode fractions: ½, ¼, ¾, ⅓, ⅔, ⅛, ⅜, ⅝, ⅞
    # Handle mixed numbers like "1½" -> "1 1/2"
    unicode_fractions = {
        '½': '1/2', '¼': '1/4', '¾': '3/4', '⅓': '1/3', '⅔': '2/3',
        '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8'
    }
    # Replace patterns like "1½" with "1 1/2" (number + unicode fraction -> number + space + fraction)
    for uf, replacement in unicode_fractions.items():
        # Pattern: single digit followed by unicode fraction -> digit + space + fraction
        # This handles "1½" -> "1 1/2" but not "11½" (which would be "11 1/2")
        ingredient = re.sub(rf'(\d){re.escape(uf)}', rf'\1 {replacement}', ingredient)
        # Also handle standalone unicode fractions
        ingredient = ingredient.replace(uf, replacement)

    # Handle fraction slash patterns that might be mixed numbers
    # Pattern like "11⁄2" where first digit is likely the whole number part
    # If we see a single digit followed by fraction slash, it might be a mixed number
    # But be careful - "11⁄2" could be "1 1/2" or "11/2" - we'll let the quantity parser handle it

    # Remove metric measurements at the end (e.g., "60 mL", "1.5 kg", "375 mL")
    ingredient = re.sub(r'\s+\d+(?:\.\d+)?\s*(?:ml|mL|g|kg|l|L)\s*$', '', ingredient, flags=re.IGNORECASE)

    # Remove parenthetical metric conversions like "(1.4 oz/38.5 g)" or "(divided)"
    ingredient = re.sub(r'\s*\([^)]*\d+[^)]*\)', '', ingredient)

    # Remove common trailing descriptive phrases
    ingredient = re.sub(r'\s*,\s*(?:divided|cut into.*|warmed).*$', '', ingredient, flags=re.IGNORECASE)

    # Pattern to match:
    # - Quantities: whole numbers, fractions (3/4, 1/2), decimals, mixed numbers (1 1/2)
    # - Units: common cooking units
    # - Ingredient name: everything after

    # Common cooking units (singular and plural)
    units = [
        'cup', 'cups', 'c', 'c.',
        'tablespoon', 'tablespoons', 'tbsp', 'tbsp.', 'T', 'T.',
        'teaspoon', 'teaspoons', 'tsp', 'tsp.', 't', 't.',
        'pound', 'pounds', 'lb', 'lb.', 'lbs', 'lbs.',
        'ounce', 'ounces', 'oz', 'oz.',
        'gram', 'grams', 'g', 'g.',
        'kilogram', 'kilograms', 'kg', 'kg.',
        'milliliter', 'milliliters', 'ml', 'ml.',
        'liter', 'liters', 'l', 'l.',
        'pint', 'pints', 'pt', 'pt.',
        'quart', 'quarts', 'qt', 'qt.',
        'gallon', 'gallons', 'gal', 'gal.',
        'piece', 'pieces', 'pc', 'pc.',
        'package', 'packages', 'pkg', 'pkg.',
        'can', 'cans',
        'bunch', 'bunches',
        'head', 'heads',
        'clove', 'cloves',
        'slice', 'slices',
        'dash', 'dashes',
        'pinch', 'pinches',
        'sprig', 'sprigs',
        'envelope', 'envelopes',
    ]

    # Create regex pattern for units with word boundaries (case-insensitive)
    # Sort by length (longest first) to match "tablespoon" before "tbsp"
    units_sorted = sorted(units, key=len, reverse=True)
    units_pattern = '|'.join(rf'\b{re.escape(unit)}\b' for unit in units_sorted)

    # Pattern for quantities:
    # - Mixed numbers: 1 1/2, 2 3/4 (must come first to avoid partial matches)
    # - Fractions: 1/2, 3/4, 1/3
    # - Decimals: 1.5, 0.5
    # - Whole numbers: 1, 2, 10
    quantity_pattern = r'(?:\d+\s+\d+/\d+)|(?:\d+/\d+)|(?:\d+\.\d+)|(?:\d+)'

    # Strategy: Try to match quantity and/or unit, then extract everything after as ingredient name
    # Use a more flexible approach that handles various formats

    # First, try to find and remove quantity at the start
    quantity_match = re.match(rf'^\s*({quantity_pattern})', ingredient, re.IGNORECASE)
    remaining = ingredient
    if quantity_match:
        # Remove the matched quantity and following whitespace
        remaining = ingredient[quantity_match.end():].strip()
        logger.debug(f"Found quantity, remaining: '{remaining}'")

    # Remove any remaining metric measurements in the middle (e.g., "1.5 kg" in "pork shoulder 1.5 kg roast")
    remaining = re.sub(r'\s+\d+(?:\.\d+)?\s*(?:ml|mL|g|kg|l|L)\s+', ' ', remaining, flags=re.IGNORECASE)
    remaining = remaining.strip()

    # Then, try to find and remove unit at the start of remaining text
    unit_match = re.match(rf'^\s*({units_pattern})\s+', remaining, re.IGNORECASE)
    if unit_match:
        # Remove the matched unit and following whitespace
        ingredient_name = remaining[unit_match.end():].strip()
        logger.debug(f"Found unit, ingredient name: '{ingredient_name}'")
    else:
        # No unit found, use remaining text as ingredient name
        ingredient_name = remaining.strip()
        logger.debug(f"No unit found, ingredient name: '{ingredient_name}'")

    # Clean up the ingredient name
    # Remove leading punctuation/whitespace
    ingredient_name = re.sub(r'^[,;:\s]+', '', ingredient_name)
    # Remove trailing parenthetical notes like "(optional)", "(divided)", etc.
    ingredient_name = re.sub(r'\s*\([^)]*\)\s*$', '', ingredient_name)
    # Remove any trailing punctuation
    ingredient_name = ingredient_name.rstrip('.,;:')
    # Remove standalone numbers at the start or middle (e.g., "onion 1 soup mix" -> "onion soup mix")
    # But keep numbers that are part of the ingredient name (e.g., "2% milk", "No. 1")
    # Pattern: number with word boundaries, but not if followed by % or other special chars
    # Don't remove if it's part of a pattern like "2%", "No. 1", etc.
    ingredient_name = re.sub(r'\b(\d+)\b(?=\s|$)(?!%)', ' ', ingredient_name)
    ingredient_name = re.sub(r'\s+', ' ', ingredient_name).strip()  # Clean up extra spaces

    # If we ended up with an empty string, return the original
    if not ingredient_name:
        logger.debug(f"Parsing resulted in empty string, returning original: '{ingredient_str}'")
        return ingredient_str.strip()

    logger.debug(f"Final parsed result: '{ingredient_str}' -> '{ingredient_name}'")
    return ingredient_name.strip()


def _parse_ingredient_quantity_and_unit(ingredient_str: str) -> Tuple[Optional[str], str]:
    """
    Parse ingredient string to extract quantity and unit.
    
    Args:
        ingredient_str: Raw ingredient string from recipe (e.g., "3/4 pound linguine")
    
    Returns:
        Tuple of (quantity_with_unit, ingredient_name)
        - quantity_with_unit: Combined quantity and unit (e.g., "3/4 pound") or None
        - ingredient_name: Clean ingredient name without quantity/unit (e.g., "linguine")
    """
    import logging
    logger = logging.getLogger(__name__)
    
    if not ingredient_str or not isinstance(ingredient_str, str):
        return None, ingredient_str.strip() if ingredient_str else ''
    
    ingredient = ingredient_str.strip()
    logger.debug(f"Parsing quantity/unit from ingredient: '{ingredient}'")
    
    # Normalize fraction slash (⁄ U+2044) to regular slash for easier parsing
    ingredient = ingredient.replace('⁄', '/')
    
    # Normalize Unicode fractions to regular fractions
    unicode_fractions = {
        '½': '1/2', '¼': '1/4', '¾': '3/4', '⅓': '1/3', '⅔': '2/3',
        '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8'
    }
    for uf, replacement in unicode_fractions.items():
        ingredient = re.sub(rf'(\d){re.escape(uf)}', rf'\1 {replacement}', ingredient)
        ingredient = ingredient.replace(uf, replacement)
    
    # Remove parenthetical metric conversions like "(1.4 oz/38.5 g)" or "(divided)"
    ingredient = re.sub(r'\s*\([^)]*\d+[^)]*\)', '', ingredient)
    
    # Remove common trailing descriptive phrases
    ingredient = re.sub(r'\s*,\s*(?:divided|cut into.*|warmed).*$', '', ingredient, flags=re.IGNORECASE)
    
    # Common cooking units (singular and plural)
    units = [
        'cup', 'cups', 'c', 'c.',
        'tablespoon', 'tablespoons', 'tbsp', 'tbsp.', 'T', 'T.',
        'teaspoon', 'teaspoons', 'tsp', 'tsp.', 't', 't.',
        'pound', 'pounds', 'lb', 'lb.', 'lbs', 'lbs.',
        'ounce', 'ounces', 'oz', 'oz.',
        'gram', 'grams', 'g', 'g.',
        'kilogram', 'kilograms', 'kg', 'kg.',
        'milliliter', 'milliliters', 'ml', 'ml.',
        'liter', 'liters', 'l', 'l.',
        'pint', 'pints', 'pt', 'pt.',
        'quart', 'quarts', 'qt', 'qt.',
        'gallon', 'gallons', 'gal', 'gal.',
        'piece', 'pieces', 'pc', 'pc.',
        'package', 'packages', 'pkg', 'pkg.',
        'can', 'cans',
        'bunch', 'bunches',
        'head', 'heads',
        'clove', 'cloves',
        'slice', 'slices',
        'dash', 'dashes',
        'pinch', 'pinches',
        'sprig', 'sprigs',
        'envelope', 'envelopes',
    ]
    
    # Sort units by length (longest first) to match "tablespoon" before "tbsp"
    units_sorted = sorted(units, key=len, reverse=True)
    units_pattern = '|'.join(rf'\b{re.escape(unit)}\b' for unit in units_sorted)
    
    # Pattern for quantities:
    # - Mixed numbers: 1 1/2, 2 3/4 (must come first to avoid partial matches)
    # - Fractions: 1/2, 3/4, 1/3
    # - Decimals: 1.5, 0.5
    # - Whole numbers: 1, 2, 10
    quantity_pattern = r'(?:\d+\s+\d+/\d+)|(?:\d+/\d+)|(?:\d+\.\d+)|(?:\d+)'
    
    # Try to match quantity at the start
    quantity_match = re.match(rf'^\s*({quantity_pattern})', ingredient, re.IGNORECASE)
    remaining = ingredient
    quantity_str = None
    
    if quantity_match:
        quantity_str = quantity_match.group(1).strip()
        remaining = ingredient[quantity_match.end():].strip()
        logger.debug(f"Found quantity: '{quantity_str}', remaining: '{remaining}'")
    
    # Remove any remaining metric measurements in the middle
    remaining = re.sub(r'\s+\d+(?:\.\d+)?\s*(?:ml|mL|g|kg|l|L)\s+', ' ', remaining, flags=re.IGNORECASE)
    remaining = remaining.strip()
    
    # Try to find unit at the start of remaining text
    unit_match = re.match(rf'^\s*({units_pattern})\s+', remaining, re.IGNORECASE)
    unit_str = None
    
    if unit_match:
        unit_str = unit_match.group(1).strip()
        ingredient_name = remaining[unit_match.end():].strip()
        logger.debug(f"Found unit: '{unit_str}', ingredient name: '{ingredient_name}'")
    else:
        # No unit found, use remaining text as ingredient name
        ingredient_name = remaining.strip()
        logger.debug(f"No unit found, ingredient name: '{ingredient_name}'")
    
    # Build quantity_with_unit string
    quantity_with_unit = None
    if quantity_str and unit_str:
        quantity_with_unit = f"{quantity_str} {unit_str}"
    elif quantity_str:
        # Only quantity, no unit
        quantity_with_unit = quantity_str
    
    # Clean up the ingredient name
    ingredient_name = re.sub(r'^[,;:\s]+', '', ingredient_name)
    ingredient_name = re.sub(r'\s*\([^)]*\)\s*$', '', ingredient_name)
    ingredient_name = ingredient_name.rstrip('.,;:')
    ingredient_name = re.sub(r'\b(\d+)\b(?=\s|$)(?!%)', ' ', ingredient_name)
    ingredient_name = re.sub(r'\s+', ' ', ingredient_name).strip()
    
    # If we ended up with an empty string, return the original
    if not ingredient_name:
        logger.debug(f"Parsing resulted in empty string, returning original: '{ingredient_str}'")
        return quantity_with_unit, ingredient_str.strip()
    
    logger.debug(f"Final parsed result: '{ingredient_str}' -> quantity: '{quantity_with_unit}', name: '{ingredient_name}'")
    return quantity_with_unit, ingredient_name.strip()


def extract_ingredients_for_shopping_list(recipe_data: Dict) -> List[Dict]:
    """
    Extract ingredients from recipe data for shopping list.
    Returns list of dicts with 'name' and 'quantity' (quantity includes unit, e.g., "3/4 pound").
    """
    ingredients = recipe_data.get('ingredients', [])
    shopping_items = []

    for ingredient in ingredients:
        if isinstance(ingredient, str):
            # Parse ingredient to extract quantity+unit and name
            quantity_with_unit, ingredient_name = _parse_ingredient_quantity_and_unit(ingredient)

            shopping_items.append({
                'name': ingredient_name,
                'quantity': quantity_with_unit,  # e.g., "3/4 pound", "1/2 cup", "2"
            })

    return shopping_items
